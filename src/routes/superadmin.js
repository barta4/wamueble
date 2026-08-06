const express = require('express');
const router = express.Router();
const { requireSuperAdmin } = require('../middleware/auth');
const SaasMetrics = require('../models/SaasMetrics');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const Store = require('../models/Store');
const { getDb } = require('../config/db');
const bcrypt = require('bcrypt');
const axios = require('axios');

// Todas las rutas requieren super-admin
router.use(requireSuperAdmin);

// ─── Dashboard ───────────────────────────────────────────────────────────────

/**
 * GET /superadmin
 * Vista principal del panel super-admin.
 */
router.get('/', (req, res) => {
    const metrics = SaasMetrics.getDashboard();
    res.render('superadmin', {
        user: req.user,
        metrics,
        title: 'Panel SaaS — WaBot'
    });
});

/**
 * GET /superadmin/api/metrics
 * Métricas agregadas del dashboard.
 */
router.get('/api/metrics', (req, res) => {
    try {
        const metrics = SaasMetrics.getDashboard();
        res.json(metrics);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Tenants ─────────────────────────────────────────────────────────────────

/**
 * GET /superadmin/api/tenants
 * Lista todos los tenants.
 */
router.get('/api/tenants', (req, res) => {
    try {
        const tenants = SaasMetrics.getTenants();
        res.json(tenants);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /superadmin/api/tenants/:id
 * Detalle de un tenant.
 */
router.get('/api/tenants/:id', (req, res) => {
    try {
        const tenant = SaasMetrics.getTenantById(req.params.id);
        if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
        res.json(tenant);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /superadmin/api/tenants/:id
 * Actualizar un tenant.
 */
router.put('/api/tenants/:id', (req, res) => {
    try {
        const db = getDb();
        const { name, phone, address, plan, suspended, suspended_reason, ai_provider, ai_model, ai_api_key } = req.body;

        const store = Store.getById(req.params.id);
        if (!store) return res.status(404).json({ error: 'Tenant no encontrado' });

        const updates = {};
        if (name !== undefined) updates.name = name;
        if (phone !== undefined) updates.phone = phone;
        if (address !== undefined) updates.address = address;
        if (plan !== undefined) updates.plan = plan;
        if (ai_provider !== undefined) updates.ai_provider = ai_provider;
        if (ai_model !== undefined) updates.ai_model = ai_model;
        if (ai_api_key !== undefined) updates.ai_api_key = ai_api_key;

        if (suspended !== undefined) {
            db.prepare('UPDATE stores SET suspended = ?, suspended_reason = ? WHERE id = ?')
                .run(suspended ? 1 : 0, suspended_reason || '', req.params.id);
        }

        if (Object.keys(updates).length > 0) {
            Store.update(req.params.id, updates);
        }

        // Registrar en auditoría
        AuditLog.log({
            adminUserId: req.user.id,
            action: 'tenant_update',
            targetType: 'store',
            targetId: parseInt(req.params.id),
            details: { before: { name: store.name, plan: store.plan }, after: updates }
        });

        res.json(Store.getById(req.params.id));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /superadmin/api/tenants/:id
 * Eliminar un tenant / local de la plataforma.
 */
router.delete('/api/tenants/:id', (req, res) => {
    try {
        const storeId = parseInt(req.params.id);
        const store = Store.getById(storeId);
        if (!store) return res.status(404).json({ error: 'Tenant no encontrado' });

        // Detener conexiones activas de WhatsApp para esta tienda
        const WhatsAppManager = require('../services/whatsapp');
        const db = getDb();
        const connections = db.prepare("SELECT id FROM whatsapp_connections WHERE store_id = ?").all(storeId);
        for (const conn of connections) {
            WhatsAppManager.stopConnection(conn.id).catch(e => console.error("Error deteniendo WhatsApp:", e));
        }

        // Eliminar tienda
        Store.delete(storeId);

        // Auditoría
        AuditLog.log({
            adminUserId: req.user.id,
            action: 'tenant_delete',
            targetType: 'store',
            targetId: storeId,
            details: { name: store.name, phone: store.phone }
        });

        res.json({ success: true, message: 'Tenant eliminado correctamente' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /superadmin/api/tenants/:id/models
 * Fetch AI models for a specific tenant directly from the provider.
 */
router.get('/api/tenants/:id/models', async (req, res) => {
    try {
        const store = Store.getById(req.params.id);
        if (!store) return res.status(404).json({ error: 'Tenant no encontrado' });

        const provider = req.query.provider || store.ai_provider;
        const apiKey = store.ai_api_key;
        
        let models = [];
        
        if (provider === 'openai') {
            if (!apiKey) {
                models = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
            } else {
                try {
                    const response = await axios.get('https://api.openai.com/v1/models', {
                        headers: { 'Authorization': `Bearer ${apiKey}` }
                    });
                    // Filter chat models
                    models = response.data.data
                        .filter(m => m.id.includes('gpt') && !m.id.includes('instruct'))
                        .map(m => m.id)
                        .sort();
                } catch (e) {
                    console.error('Error fetching OpenAI models:', e.message);
                    models = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
                }
            }
        } else if (provider === 'gemini') {
            if (!apiKey) {
                models = ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'];
            } else {
                try {
                    const response = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
                    models = response.data.models
                        .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                        .map(m => m.name.replace('models/', ''))
                        .sort();
                } catch (e) {
                    console.error('Error fetching Gemini models:', e.message);
                    models = ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'];
                }
            }
        } else if (provider === 'anthropic') {
            // Anthropic currently requires a specific API structure for listing models that might not be available yet,
            // or we just fallback to a reliable hardcoded list since they only have a few.
            models = ['claude-3-5-sonnet-20240620', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'];
        }

        // Return unique sorted models to prevent duplicates
        models = [...new Set(models)];
        res.json({ models });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /superadmin/api/tenants/:id/suspend
 * Suspender un tenant.
 */
router.post('/api/tenants/:id/suspend', (req, res) => {
    try {
        const db = getDb();
        const { reason } = req.body;

        db.prepare('UPDATE stores SET suspended = 1, suspended_reason = ? WHERE id = ?')
            .run(reason || 'Suspendido por administrador', req.params.id);

        AuditLog.log({
            adminUserId: req.user.id,
            action: 'tenant_suspend',
            targetType: 'store',
            targetId: parseInt(req.params.id),
            details: { reason }
        });

        res.json({ success: true, message: 'Tenant suspendido' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /superadmin/api/tenants/:id/activate
 * Activar un tenant.
 */
router.post('/api/tenants/:id/activate', (req, res) => {
    try {
        const db = getDb();

        db.prepare('UPDATE stores SET suspended = 0, suspended_reason = \'\' WHERE id = ?')
            .run(req.params.id);

        AuditLog.log({
            adminUserId: req.user.id,
            action: 'tenant_activate',
            targetType: 'store',
            targetId: parseInt(req.params.id),
            details: {}
        });

        res.json({ success: true, message: 'Tenant activado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Usuarios ────────────────────────────────────────────────────────────────

/**
 * GET /superadmin/api/users
 * Lista todos los usuarios.
 */
router.get('/api/users', (req, res) => {
    try {
        const users = User.getAll();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /superadmin/api/users
 * Crear un nuevo usuario.
 */
router.post('/api/users', async (req, res) => {
    try {
        const { email, password, name, role, store_id } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, password y nombre son requeridos' });
        }

        const existing = User.findByEmail(email);
        if (existing) {
            return res.status(400).json({ error: 'El email ya está registrado' });
        }

        const user = await User.create({
            email,
            password,
            name,
            role: role || 'owner',
            storeId: store_id || null
        });

        AuditLog.log({
            adminUserId: req.user.id,
            action: 'user_create',
            targetType: 'user',
            targetId: user.id,
            details: { email, name, role }
        });

        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /superadmin/api/users/:id
 * Actualizar un usuario.
 */
router.put('/api/users/:id', (req, res) => {
    try {
        const user = User.getById(req.params.id);
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        const { name, email, role, store_id, plan } = req.body;
        const updates = {};
        if (name !== undefined) updates.name = name;
        if (email !== undefined) updates.email = email;
        if (role !== undefined) updates.role = role;
        if (store_id !== undefined) updates.store_id = store_id;
        if (plan !== undefined) updates.plan = plan;

        if (Object.keys(updates).length > 0) {
            User.update(req.params.id, updates);
        }

        AuditLog.log({
            adminUserId: req.user.id,
            action: 'user_update',
            targetType: 'user',
            targetId: parseInt(req.params.id),
            details: { before: { name: user.name, role: user.role }, after: updates }
        });

        res.json(User.getById(req.params.id));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /superadmin/api/users/:id
 * Eliminar un usuario.
 */
router.delete('/api/users/:id', (req, res) => {
    try {
        const db = getDb();
        const user = User.getById(req.params.id);
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        // No permitir eliminar superadmin
        if (user.role === 'superadmin') {
            return res.status(400).json({ error: 'No se puede eliminar un superadmin' });
        }

        db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);

        AuditLog.log({
            adminUserId: req.user.id,
            action: 'user_delete',
            targetType: 'user',
            targetId: parseInt(req.params.id),
            details: { email: user.email, name: user.name }
        });

        res.json({ success: true, message: 'Usuario eliminado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /superadmin/api/users/:id/reset-password
 * Resetear contraseña de un usuario.
 */
router.post('/api/users/:id/reset-password', async (req, res) => {
    try {
        const user = User.getById(req.params.id);
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        const { password } = req.body;
        if (!password || password.length < 6) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        }

        await User.changePassword(req.params.id, password);

        AuditLog.log({
            adminUserId: req.user.id,
            action: 'user_reset_password',
            targetType: 'user',
            targetId: parseInt(req.params.id),
            details: { email: user.email }
        });

        res.json({ success: true, message: 'Contraseña actualizada' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Planes ──────────────────────────────────────────────────────────────────

/**
 * GET /superadmin/api/plans
 * Lista todos los planes.
 */
router.get('/api/plans', (req, res) => {
    try {
        const db = getDb();
        let plans = db.prepare('SELECT * FROM saas_plans ORDER BY sort_order, price').all();

        // Si no hay planes en BD, rellenar con los predefinidos
        if (plans.length === 0) {
            const { getAllPlans } = require('../config/plans');
            const defaultPlans = getAllPlans();
            
            const insertPlan = db.prepare(`
                INSERT INTO saas_plans (id, name, price, currency, interval, description, features, limits, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            let order = 0;
            for (const p of defaultPlans) {
                insertPlan.run(
                    p.id, p.name, p.price, p.currency, p.interval, 
                    p.description, JSON.stringify(p.features), JSON.stringify(p.limits), order
                );
                order++;
            }
            
            // Volver a consultar
            plans = db.prepare('SELECT * FROM saas_plans ORDER BY sort_order, price').all();
        }

        res.json(plans.map(p => ({
            ...p,
            features: JSON.parse(p.features || '[]'),
            limits: JSON.parse(p.limits || '{}')
        })));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /superadmin/api/plans
 * Crear un nuevo plan.
 */
router.post('/api/plans', (req, res) => {
    try {
        const db = getDb();
        const { id, name, price, currency, interval, description, features, limits, sort_order } = req.body;

        if (!id || !name) {
            return res.status(400).json({ error: 'ID y nombre son requeridos' });
        }

        db.prepare(`
            INSERT INTO saas_plans (id, name, price, currency, interval, description, features, limits, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id, name, price || 0, currency || 'USD', interval || 'month',
            description || '', JSON.stringify(features || []), JSON.stringify(limits || {}),
            sort_order || 0
        );

        AuditLog.log({
            adminUserId: req.user.id,
            action: 'plan_create',
            targetType: 'plan',
            targetId: null,
            details: { id, name, price }
        });

        res.json({ success: true, message: 'Plan creado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /superadmin/api/plans/:id
 * Actualizar un plan.
 */
router.put('/api/plans/:id', (req, res) => {
    try {
        const db = getDb();
        const { name, price, currency, interval, description, features, limits, active, sort_order } = req.body;

        const fields = [];
        const values = [];

        if (name !== undefined) { fields.push('name = ?'); values.push(name); }
        if (price !== undefined) { fields.push('price = ?'); values.push(price); }
        if (currency !== undefined) { fields.push('currency = ?'); values.push(currency); }
        if (interval !== undefined) { fields.push('interval = ?'); values.push(interval); }
        if (description !== undefined) { fields.push('description = ?'); values.push(description); }
        if (features !== undefined) { fields.push('features = ?'); values.push(JSON.stringify(features)); }
        if (limits !== undefined) { fields.push('limits = ?'); values.push(JSON.stringify(limits)); }
        if (active !== undefined) { fields.push('active = ?'); values.push(active ? 1 : 0); }
        if (sort_order !== undefined) { fields.push('sort_order = ?'); values.push(sort_order); }

        if (fields.length === 0) return res.json({ success: true });

        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(req.params.id);

        db.prepare(`UPDATE saas_plans SET ${fields.join(', ')} WHERE id = ?`).run(...values);

        AuditLog.log({
            adminUserId: req.user.id,
            action: 'plan_update',
            targetType: 'plan',
            targetId: null,
            details: { id: req.params.id, changes: req.body }
        });

        res.json({ success: true, message: 'Plan actualizado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /superadmin/api/plans/:id
 * Eliminar un plan.
 */
router.delete('/api/plans/:id', (req, res) => {
    try {
        const db = getDb();

        // No permitir eliminar planes predefinidos
        if (['free', 'pro', 'enterprise'].includes(req.params.id)) {
            return res.status(400).json({ error: 'No se pueden eliminar los planes predefinidos' });
        }

        db.prepare('DELETE FROM saas_plans WHERE id = ?').run(req.params.id);

        AuditLog.log({
            adminUserId: req.user.id,
            action: 'plan_delete',
            targetType: 'plan',
            targetId: null,
            details: { id: req.params.id }
        });

        res.json({ success: true, message: 'Plan eliminado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Monitoreo ───────────────────────────────────────────────────────────────

/**
 * GET /superadmin/api/ai-status
 * Estado de agentes IA por tenant.
 */
router.get('/api/ai-status', (req, res) => {
    try {
        const status = SaasMetrics.getAiStatus();
        res.json(status);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /superadmin/api/whatsapp-status
 * Estado de WhatsApp por tenant.
 */
router.get('/api/whatsapp-status', (req, res) => {
    try {
        const status = SaasMetrics.getWhatsAppStatus();
        res.json(status);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /superadmin/api/db-connections
 * Estado de conexiones BD externas por tenant.
 */
router.get('/api/db-connections', (req, res) => {
    try {
        const connections = SaasMetrics.getDbConnections();
        res.json(connections);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Auditoría ───────────────────────────────────────────────────────────────

/**
 * GET /superadmin/api/audit
 * Log de auditoría paginado.
 */
router.get('/api/audit', (req, res) => {
    try {
        const { page, limit, targetType, targetId } = req.query;
        const result = AuditLog.getLogs({
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 50,
            targetType,
            targetId: targetId ? parseInt(targetId) : undefined
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

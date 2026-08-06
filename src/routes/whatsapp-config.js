const express = require('express');
const router = express.Router();
const WhatsAppManager = require('../services/whatsapp');
const { getDb } = require('../config/db');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');

// Obtener lista de conexiones de la tienda logueada y límites del plan
router.get('/connections', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const db = getDb();
        
        // Obtener límite de conexiones del plan del store
        const store = db.prepare("SELECT plan FROM stores WHERE id = ?").get(storeId);
        const planId = store ? store.plan : 'free';
        const planConfig = require('../config/plans').getPlan(planId);
        const limit = planConfig.limits.whatsappNumbers || 1;
        
        const connections = db.prepare("SELECT * FROM whatsapp_connections WHERE store_id = ? AND active = 1").all(storeId);
        
        // Mapear con estado conectado real en memoria
        const connsWithStatus = connections.map(conn => {
            const provider = WhatsAppManager.getProvider(conn.id);
            let isConnected = false;
            let baileysUser = null;
            
            if (provider) {
                if (conn.mode === 'meta') {
                    isConnected = !!provider.accessToken;
                } else {
                    isConnected = provider.sock && provider.sock.user;
                    baileysUser = isConnected ? provider.sock.user.id : null;
                }
            }
            
            return {
                id: conn.id,
                phone: conn.phone,
                mode: conn.mode,
                status: isConnected ? 'connected' : 'disconnected',
                metaConfig: {
                    accessToken: conn.meta_access_token || '',
                    phoneId: conn.meta_phone_id || '',
                    verifyToken: conn.meta_verify_token || ''
                },
                baileysUser
            };
        });
        
        res.json({
            connections: connsWithStatus,
            limit,
            plan: planId
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Crear nueva conexión de WhatsApp
router.post('/connections', requireAuth, async (req, res) => {
    try {
        const storeId = req.user.store_id;
        const { mode, phone, meta_access_token, meta_phone_id, meta_verify_token } = req.body;
        const db = getDb();
        
        // Validar límites del plan
        const store = db.prepare("SELECT plan FROM stores WHERE id = ?").get(storeId);
        const planId = store ? store.plan : 'free';
        const planConfig = require('../config/plans').getPlan(planId);
        const limit = planConfig.limits.whatsappNumbers || 1;
        
        const currentCount = db.prepare("SELECT COUNT(*) as count FROM whatsapp_connections WHERE store_id = ? AND active = 1").get(storeId).count;
        if (currentCount >= limit) {
            return res.status(400).json({ error: `Has alcanzado el límite de tu plan (${limit} números de WhatsApp). Mejora tu plan para añadir más.` });
        }
        
        const info = db.prepare(`
            INSERT INTO whatsapp_connections (store_id, phone, mode, meta_access_token, meta_phone_id, meta_verify_token, status)
            VALUES (?, ?, ?, ?, ?, ?, 'disconnected')
        `).run(storeId, phone || '', mode || 'baileys', meta_access_token || '', meta_phone_id || '', meta_verify_token || '');
        
        const newConn = db.prepare("SELECT * FROM whatsapp_connections WHERE id = ?").get(info.lastInsertRowid);
        
        // Iniciar la conexión en memoria
        await WhatsAppManager.startConnection(newConn);
        
        res.json({ success: true, connection: newConn });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Guardar configuración de Meta y cambiar a Meta para una conexión específica
router.post('/connections/:id/save-meta', requireAuth, async (req, res) => {
    try {
        const storeId = req.user.store_id;
        const connectionId = req.params.id;
        const { accessToken, phoneId, verifyToken, phone } = req.body;
        const db = getDb();
        
        // Verificar propiedad
        const conn = db.prepare("SELECT * FROM whatsapp_connections WHERE id = ? AND store_id = ?").get(connectionId, storeId);
        if (!conn) return res.status(404).json({ error: "Conexión no encontrada" });
        
        db.prepare(`
            UPDATE whatsapp_connections 
            SET mode = 'meta', phone = ?, meta_access_token = ?, meta_phone_id = ?, meta_verify_token = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(phone || conn.phone, accessToken, phoneId, verifyToken, connectionId);
        
        const updatedConn = db.prepare("SELECT * FROM whatsapp_connections WHERE id = ?").get(connectionId);
        await WhatsAppManager.startConnection(updatedConn);
        
        res.json({ success: true, message: "Configuración de Meta guardada. Modo cambiado a Cloud API." });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Cambiar modo de una conexión específica a Baileys
router.post('/connections/:id/switch-baileys', requireAuth, async (req, res) => {
    try {
        const storeId = req.user.store_id;
        const connectionId = req.params.id;
        const db = getDb();
        
        const conn = db.prepare("SELECT * FROM whatsapp_connections WHERE id = ? AND store_id = ?").get(connectionId, storeId);
        if (!conn) return res.status(404).json({ error: "Conexión no encontrada" });
        
        db.prepare("UPDATE whatsapp_connections SET mode = 'baileys', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(connectionId);
        
        const updatedConn = db.prepare("SELECT * FROM whatsapp_connections WHERE id = ?").get(connectionId);
        await WhatsAppManager.startConnection(updatedConn, true);
        
        res.json({ success: true, message: "Modo cambiado a Dispositivo (Baileys). Generando código..." });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Generar Pairing Code para una conexión Baileys específica
router.post('/connections/:id/pairing-code', requireAuth, async (req, res) => {
    try {
        const storeId = req.user.store_id;
        const connectionId = req.params.id;
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ error: "Teléfono requerido" });
        
        const db = getDb();
        const conn = db.prepare("SELECT * FROM whatsapp_connections WHERE id = ? AND store_id = ?").get(connectionId, storeId);
        if (!conn) return res.status(404).json({ error: "Conexión no encontrada" });
        
        // Asegurar que esté en modo Baileys y actualizar el teléfono en la DB
        db.prepare("UPDATE whatsapp_connections SET mode = 'baileys', phone = ? WHERE id = ?").run(phone, connectionId);
        
        const updatedConn = db.prepare("SELECT * FROM whatsapp_connections WHERE id = ?").get(connectionId);
        await WhatsAppManager.startConnection(updatedConn);
        
        const code = await WhatsAppManager.getBaileysPairingCode(phone, connectionId);
        res.json({ success: true, code });
    } catch (e) {
        console.error("Error pidiendo pairing code:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// Desconectar Baileys (Logout) para una conexión específica
router.post('/connections/:id/logout-baileys', requireAuth, async (req, res) => {
    try {
        const storeId = req.user.store_id;
        const connectionId = req.params.id;
        const db = getDb();
        
        const conn = db.prepare("SELECT * FROM whatsapp_connections WHERE id = ? AND store_id = ?").get(connectionId, storeId);
        if (!conn) return res.status(404).json({ error: "Conexión no encontrada" });
        
        await WhatsAppManager.stopConnection(connectionId);
        
        const sessionDir = `./auth_info_baileys_conn_${connectionId}`;
        fs.rmSync(sessionDir, { recursive: true, force: true });
        
        // Reiniciar el provider en modo Baileys limpio
        await WhatsAppManager.startConnection(conn);
        
        res.json({ success: true, message: "Sesión cerrada." });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Eliminar conexión de WhatsApp por completo
router.delete('/connections/:id', requireAuth, async (req, res) => {
    try {
        const storeId = req.user.store_id;
        const connectionId = req.params.id;
        const db = getDb();
        
        const conn = db.prepare("SELECT * FROM whatsapp_connections WHERE id = ? AND store_id = ?").get(connectionId, storeId);
        if (!conn) return res.status(404).json({ error: "Conexión no encontrada" });
        
        // Detener en memoria
        await WhatsAppManager.stopConnection(connectionId);
        
        // Limpiar carpeta de sesión si existía
        const sessionDir = `./auth_info_baileys_conn_${connectionId}`;
        fs.rmSync(sessionDir, { recursive: true, force: true });
        
        // Eliminar de base de datos
        db.prepare("DELETE FROM whatsapp_connections WHERE id = ?").run(connectionId);
        
        res.json({ success: true, message: "Conexión eliminada correctamente." });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Bot state (global)
const BotState = require('../models/BotState');

router.get('/bot-status', requireAuth, (req, res) => {
    try {
        res.json({ active: BotState.isActive() });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/bot-toggle', requireAuth, (req, res) => {
    try {
        const { active } = req.body;
        if (typeof active !== 'boolean') {
            return res.status(400).json({ error: 'Se requiere { active: true/false }' });
        }
        BotState.setActive(active);

        const io = req.app.get('io');
        if (io) {
            io.to('admin').emit('bot-status-changed', { active });
        }

        res.json({ success: true, active });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /api/customers
 * Obtener todos los clientes del local
 */
router.get('/', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const customers = Customer.getAll(storeId);
        res.json(customers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

function normalizePhone(phone) {
    if (!phone) return '';
    let p = String(phone).trim();
    if (p.startsWith(' ')) p = '+' + p.trim();
    return p;
}

/**
 * GET /api/customers/:phone/orders
 * Obtener el historial de pedidos de un cliente específico
 */
router.get('/:phone/orders', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const phone = normalizePhone(req.params.phone);
        const orders = Customer.getOrderHistory(storeId, phone, 10);
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PATCH /api/customers/:phone/notes
 * Actualizar notas del bot para un cliente
 */
router.patch('/:phone/notes', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const phone = normalizePhone(req.params.phone);
        const { notes } = req.body;
        
        // Asegurar que el cliente existe en la base de datos
        Customer.getOrCreate(storeId, phone);
        Customer.updateNotes(storeId, phone, notes);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/customers/:phone
 * Actualizar perfil (nombre y notas) del cliente (compatibilidad frontend)
 */
router.put('/:phone', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const phone = normalizePhone(req.params.phone);
        const { name, bot_notes, ai_provider } = req.body;
        
        // Asegurar que el cliente existe
        Customer.getOrCreate(storeId, phone);
        
        Customer.updateProfile(storeId, phone, {
            name: name || null,
            bot_notes: bot_notes || '',
            ai_provider: ai_provider !== undefined ? ai_provider : undefined
        });
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/customers
 * Crear manualmente un cliente en el CRM
 */
router.post('/', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const { phone, name, bot_notes } = req.body;

        if (!phone) {
            return res.status(400).json({ error: 'El número de teléfono es obligatorio' });
        }

        const normPhone = normalizePhone(phone);
        const customer = Customer.create({
            storeId,
            phone: normPhone,
            name: name || null,
            botNotes: bot_notes || ''
        });

        res.status(201).json(customer);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/customers/:phone
 * Eliminar un cliente del CRM
 */
router.delete('/:phone', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const phone = normalizePhone(req.params.phone);

        const result = Customer.delete(storeId, phone);
        if (result.changes === 0) return res.status(404).json({ error: 'Cliente no encontrado' });

        res.json({ success: true, message: 'Cliente eliminado correctamente' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

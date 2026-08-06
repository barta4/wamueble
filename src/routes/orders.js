const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Driver = require('../models/Driver');
const WhatsAppService = require('../services/whatsapp');
const NotificationService = require('../services/NotificationService');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /api/orders/pending
 * Obtener pedidos pendientes del local.
 */
router.get('/pending', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const orders = Order.getPending(storeId);
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/orders/history
 * Obtener historial de pedidos.
 */
router.get('/history', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const limit = parseInt(req.query.limit) || 50;
        const orders = Order.getHistory(storeId, limit);
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/orders/daily-report
 * Obtener el reporte diario de ventas y repartos.
 */
router.get('/daily-report', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const report = Order.getDailyReport(storeId);
        res.json(report);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/orders/:id
 * Obtener un pedido por ID.
 */
router.get('/:id', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const order = Order.getById(req.params.id);
        if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
        if (order.store_id !== storeId) return res.status(403).json({ error: 'Acceso denegado' });
        res.json(order);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/orders/:id/ready
 * Marcar pedido como listo → notificar al repartidor seleccionado.
 */
router.post('/:id/ready', requireAuth, async (req, res) => {
    try {
        const storeId = req.user.store_id;
        const order = Order.getById(req.params.id);
        if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
        if (order.store_id !== storeId) return res.status(403).json({ error: 'Acceso denegado' });

        const { driverId } = req.body;

        if (!driverId) {
            return res.status(400).json({ error: 'Seleccioná un repartidor' });
        }

        const driver = Driver.getById(driverId);
        if (!driver || driver.store_id !== storeId) {
            return res.status(404).json({ error: 'Repartidor no encontrado' });
        }

        const updatedOrder = Order.markReady(req.params.id, driverId, storeId);
        if (!updatedOrder) return res.status(404).json({ error: 'Pedido no encontrado' });

        try {
            await WhatsAppService.notifyDelivery(updatedOrder, driver.phone, storeId);
            WhatsAppService.notifyCustomerReady(updatedOrder.customer_phone, updatedOrder.order_number, storeId)
                .catch(e => console.error('Error notificando al cliente:', e.message));

            NotificationService.notify('ready', updatedOrder, storeId)
                .catch(e => console.error('Error en aviso externo (ready):', e.message));
        } catch (whatsappError) {
            console.error('⚠️ Error enviando notificación WhatsApp:', whatsappError.message);
        }
        io.to('pedidos').to(`store_${storeId}_pedidos`).emit('pedido-listo', updatedOrder);

        res.json({ ...updatedOrder, driver });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/orders/:id/cancel
 * Cancelar un pedido.
 */
router.post('/:id/cancel', requireAuth, async (req, res) => {
    try {
        const storeId = req.user.store_id;
        const existingOrder = Order.getById(req.params.id);
        if (!existingOrder) return res.status(404).json({ error: 'Pedido no encontrado' });
        if (existingOrder.store_id !== storeId) return res.status(403).json({ error: 'Acceso denegado' });

        const order = Order.cancel(req.params.id, storeId);
        if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

        const io = req.app.get('io');
        io.to('pedidos').to(`store_${storeId}_pedidos`).emit('pedido-cancelado', { id: order.id });

        res.json(order);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/orders/:id/deliver
 * Marcar pedido como entregado.
 */
router.post('/:id/deliver', requireAuth, async (req, res) => {
    try {
        const storeId = req.user.store_id;
        const existingOrder = Order.getById(req.params.id);
        if (!existingOrder) return res.status(404).json({ error: 'Pedido no encontrado' });
        if (existingOrder.store_id !== storeId) return res.status(403).json({ error: 'Acceso denegado' });

        const order = Order.markDelivered(req.params.id, storeId);
        if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

        const io = req.app.get('io');
        io.to('pedidos').to(`store_${storeId}_pedidos`).emit('pedido-entregado', { id: order.id });

        res.json(order);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/orders/test
 * Crear un pedido de prueba.
 */
router.post('/test', requireAuth, async (req, res) => {
    try {
        const storeId = req.user.store_id;
        const order = Order.create({
            storeId,
            customerPhone: '+59899000111',
            customerName: 'Cliente de Prueba',
            address: 'Av. 18 de Julio 1400, Ap. 501',
            paymentMethod: 'Efectivo ($1000)',
            items: [
                { product_name: 'Producto de Prueba', quantity: 1, unit_price: 100, details: '' }
            ],
            notes: 'Pedido de prueba'
        });

        const io = req.app.get('io');
        io.to('pedidos').to(`store_${storeId}_pedidos`).emit('nuevo-pedido', order);

        res.json({ success: true, order });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

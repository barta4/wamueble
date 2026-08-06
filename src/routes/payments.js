const express = require('express');
const router = express.Router();
const PaymentService = require('../services/PaymentService');

/**
 * POST /api/payments/link
 * Generar link de pago para un pedido, cita o reserva
 */
router.post('/link', async (req, res) => {
    try {
        const { title, price, externalReference, storeId } = req.body;
        if (!price || !externalReference) {
            return res.status(400).json({ error: 'Monto (price) y referencia (externalReference) son requeridos.' });
        }

        const result = await PaymentService.createMercadoPagoPreference({ title, price, externalReference, storeId });
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/payments/webhook/mercadopago
 * Webhook IPN de Mercado Pago
 */
router.post('/webhook/mercadopago', async (req, res) => {
    try {
        const { data, type } = req.body;
        const ref = req.query.ref || (data ? data.id : null);

        if (ref) {
            await PaymentService.processPaymentNotification(ref, 'paid');
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('Error procesando webhook de pago:', error.message);
        res.status(200).send('OK');
    }
});

module.exports = router;

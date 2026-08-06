const axios = require('axios');
const Order = require('../models/Order');
const Appointment = require('../models/Appointment');
const Booking = require('../models/Booking');

class PaymentService {
    /**
     * Crear link de pago en Mercado Pago.
     */
    static async createMercadoPagoPreference({ title, price, externalReference, storeId }) {
        const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
        if (!mpAccessToken) {
            // Fallback a link de prueba o simulación si no se configuró credencial real
            return {
                paymentUrl: `https://mpago.la/pos?ref=${externalReference}&price=${price}`,
                preferenceId: `pref_sim_${Date.now()}`
            };
        }

        try {
            const response = await axios.post('https://api.mercadopago.com/checkout/preferences', {
                items: [{
                    title: title || 'Servicio / Pedido UruBot',
                    unit_price: parseFloat(price),
                    quantity: 1,
                    currency_id: 'UYU'
                }],
                external_reference: String(externalReference),
                notification_url: `${process.env.PUBLIC_URL || 'https://urubot.app'}/api/payments/webhook/mercadopago`
            }, {
                headers: { 'Authorization': `Bearer ${mpAccessToken}` }
            });

            return {
                paymentUrl: response.data.init_point,
                preferenceId: response.data.id
            };
        } catch (error) {
            console.error('Error creando preferencia Mercado Pago:', error.response ? error.response.data : error.message);
            return {
                paymentUrl: `https://mpago.la/pos?ref=${externalReference}&price=${price}`,
                preferenceId: `pref_fallback_${Date.now()}`
            };
        }
    }

    /**
     * Procesar notificación Webhook (IPN) de pago recibido.
     */
    static async processPaymentNotification(reference, status = 'paid') {
        const db = require('../config/db').getDb();

        // 1. Verificar si es un Pedido
        const order = db.prepare('SELECT * FROM orders WHERE id = ? OR order_number = ?').get(reference, reference);
        if (order) {
            db.prepare("UPDATE orders SET payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, order.id);
            console.log(`💳 [Pago Confirmado] Pedido #${order.order_number} actualizado a status: ${status}`);
            return { type: 'order', id: order.id };
        }

        // 2. Verificar si es una Cita
        const apt = db.prepare('SELECT * FROM appointments WHERE id = ? OR appointment_number = ?').get(reference, reference);
        if (apt) {
            db.prepare("UPDATE appointments SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(apt.id);
            console.log(`💳 [Pago Confirmado] Cita #${apt.appointment_number} confirmada.`);
            return { type: 'appointment', id: apt.id };
        }

        // 3. Verificar si es una Reserva de Hostel
        const booking = db.prepare('SELECT * FROM bookings WHERE id = ? OR booking_number = ?').get(reference, reference);
        if (booking) {
            db.prepare("UPDATE bookings SET payment_status = ?, status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, booking.id);
            console.log(`💳 [Pago Confirmado] Reserva #${booking.booking_number} confirmada.`);
            return { type: 'booking', id: booking.id };
        }

        return null;
    }
}

module.exports = PaymentService;

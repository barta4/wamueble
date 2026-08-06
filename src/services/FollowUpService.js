const { getDb } = require('../config/db');
const { query: pgQuery } = require('../config/postgres');
const Store = require('../models/Store');
const WhatsAppManager = require('./whatsapp');

class FollowUpService {
    constructor() {
        this.isRunning = false;
        this.workerInterval = null;
    }

    isPgMode() {
        return process.env.USE_POSTGRES === 'true' || !!process.env.DATABASE_URL;
    }

    /**
     * Verifica si ya se envió un seguimiento para esta referencia y evento.
     */
    async isLogSent(storeId, eventType, referenceId) {
        if (!referenceId) return false;
        if (this.isPgMode()) {
            const res = await pgQuery(`
                SELECT 1 FROM follow_up_logs 
                WHERE store_id = $1 AND event_type = $2 AND reference_id = $3
            `, [storeId, eventType, referenceId]);
            return res.rows.length > 0;
        } else {
            const db = getDb();
            const log = db.prepare(`
                SELECT 1 FROM follow_up_logs 
                WHERE store_id = ? AND event_type = ? AND reference_id = ?
            `).get(storeId, eventType, referenceId);
            return !!log;
        }
    }

    /**
     * Registra que se envió un seguimiento.
     */
    async recordLog(storeId, customerPhone, eventType, referenceId) {
        try {
            if (this.isPgMode()) {
                await pgQuery(`
                    INSERT INTO follow_up_logs (store_id, customer_phone, event_type, reference_id)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT DO NOTHING
                `, [storeId, customerPhone, eventType, referenceId]);
            } else {
                const db = getDb();
                db.prepare(`
                    INSERT OR IGNORE INTO follow_up_logs (store_id, customer_phone, event_type, reference_id)
                    VALUES (?, ?, ?, ?)
                `).run(storeId, customerPhone, eventType, referenceId);
            }
        } catch (e) {
            console.error('Error registrando log de seguimiento:', e.message);
        }
    }

    /**
     * 🏨 AUTOMATIZACIONES MODO HOSTEL / HOTEL
     */
    async processHostelAutomations(store) {
        const db = getDb();
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const today = new Date().toISOString().split('T')[0];

        // 1. Pre-Checkin (24h antes del ingreso)
        const upcomingBookings = db.prepare(`
            SELECT * FROM bookings 
            WHERE store_id = ? AND check_in_date = ? AND status IN ('confirmed', 'pending')
        `).all(store.id, tomorrow);

        for (const booking of upcomingBookings) {
            const alreadySent = await this.isLogSent(store.id, 'pre_checkin', booking.id);
            if (alreadySent) continue;

            const message = `🏨 ¡Hola ${booking.customer_name || 'Huésped'}! Mañana es tu Check-in en ${store.name}.\n\n` +
                `📌 Reserva N°: ${booking.booking_number}\n` +
                `🛏️ Habitación: ${booking.room_name}\n` +
                `📍 Dirección: ${store.address || 'Consultar recepción'}\n` +
                `📶 Wi-Fi: Solicitá la clave al ingresar.\n\n` +
                `¡Te esperamos con todo listo! Por favor respondé este mensaje si tenés dudas sobre tu hora de llegada. 😊`;

            try {
                await WhatsAppManager.sendTextMessage(booking.customer_phone, message, store.id);
                await this.recordLog(store.id, booking.customer_phone, 'pre_checkin', booking.id);
                console.log(`📲 [Hostel Follow-up] Pre-checkin enviado a ${booking.customer_phone} para reserva #${booking.booking_number}`);
            } catch (e) {
                console.error(`Error enviando pre-checkin a ${booking.customer_phone}:`, e.message);
            }
        }

        // 2. Post-Checkout (Día del Checkout)
        const completedBookings = db.prepare(`
            SELECT * FROM bookings 
            WHERE store_id = ? AND check_out_date = ? AND status = 'checked_out'
        `).all(store.id, today);

        for (const booking of completedBookings) {
            const alreadySent = await this.isLogSent(store.id, 'post_checkout', booking.id);
            if (alreadySent) continue;

            const message = `🌟 ¡Gracias por hospedarte en ${store.name}, ${booking.customer_name || ''}!\n\n` +
                `Esperamos que hayas disfrutado tu estadía. Tu opinión nos ayuda mucho a mejorar. ¿Qué tal estuvo tu experiencia del 1 al 5? ⭐\n\n` +
                `¡Esperamos volver a verte pronto! 🧳`;

            try {
                await WhatsAppManager.sendTextMessage(booking.customer_phone, message, store.id);
                await this.recordLog(store.id, booking.customer_phone, 'post_checkout', booking.id);
                console.log(`📲 [Hostel Follow-up] Post-checkout enviado a ${booking.customer_phone}`);
            } catch (e) {
                console.error(`Error enviando post-checkout a ${booking.customer_phone}:`, e.message);
            }
        }
    }

    /**
     * 🏥 AUTOMATIZACIONES MODO CLÍNICA / CITAS
     */
    async processClinicAutomations(store) {
        const db = getDb();
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const today = new Date().toISOString().split('T')[0];

        // 1. Recordatorio de Cita (24h antes)
        const upcomingAppointments = db.prepare(`
            SELECT * FROM appointments 
            WHERE store_id = ? AND date = ? AND status IN ('confirmed', 'pending')
        `).all(store.id, tomorrow);

        for (const apt of upcomingAppointments) {
            const alreadySent = await this.isLogSent(store.id, 'appointment_reminder', apt.id);
            if (alreadySent) continue;

            const doctorStr = apt.doctor ? ` con el/la Dr/a. ${apt.doctor}` : '';
            const message = `🏥 Recordatorio de Cita — ${store.name}\n\n` +
                `Hola ${apt.customer_name || ''}, te recordamos tu cita para mañana ${apt.date} a las ${apt.time} hs${doctorStr}.\n` +
                `🩺 Servicio: ${apt.service}\n` +
                `📍 Dirección: ${store.address || 'Consultar recepción'}\n\n` +
                `Por favor respondé *CONFIRMAR* para asegurar tu turno o avísanos si necesitás reprogramar.`;

            try {
                await WhatsAppManager.sendTextMessage(apt.customer_phone, message, store.id);
                await this.recordLog(store.id, apt.customer_phone, 'appointment_reminder', apt.id);
                console.log(`📲 [Clinic Follow-up] Recordatorio enviado a ${apt.customer_phone} para cita #${apt.appointment_number}`);
            } catch (e) {
                console.error(`Error enviando recordatorio a ${apt.customer_phone}:`, e.message);
            }
        }

        // 2. Encuesta Post-Consulta (Hoy atendidos)
        const completedApts = db.prepare(`
            SELECT * FROM appointments 
            WHERE store_id = ? AND date = ? AND status = 'completed'
        `).all(store.id, today);

        for (const apt of completedApts) {
            const alreadySent = await this.isLogSent(store.id, 'clinic_feedback', apt.id);
            if (alreadySent) continue;

            const message = `🏥 Hola ${apt.customer_name || ''}, gracias por atenderte hoy en ${store.name}.\n\n` +
                `¿Cómo calificarías la atención recibida del 1 al 5? ⭐ Tu opinión es muy valiosa para nuestro equipo.`;

            try {
                await WhatsAppManager.sendTextMessage(apt.customer_phone, message, store.id);
                await this.recordLog(store.id, apt.customer_phone, 'clinic_feedback', apt.id);
                console.log(`📲 [Clinic Follow-up] Encuesta de consulta enviada a ${apt.customer_phone}`);
            } catch (e) {
                console.error(`Error enviando encuesta a ${apt.customer_phone}:`, e.message);
            }
        }
    }

    /**
     * 🛍️ AUTOMATIZACIONES MODO TIENDA / PEDIDOS
     */
    async processStoreAutomations(store) {
        const db = getDb();
        const today = new Date().toISOString().split('T')[0];

        // 1. Encuesta de Satisfacción Post-Entrega
        const deliveredOrders = db.prepare(`
            SELECT * FROM orders 
            WHERE store_id = ? AND status = 'delivered' AND DATE(updated_at, 'localtime') = ?
        `).all(store.id, today);

        for (const order of deliveredOrders) {
            const alreadySent = await this.isLogSent(store.id, 'order_feedback', order.id);
            if (alreadySent) continue;

            const message = `🛵 ¡Hola ${order.customer_name || ''}! Esperamos que hayas disfrutado tu pedido #${order.order_number} en ${store.name}.\n\n` +
                `¿Cómo estuvo tu experiencia del 1 al 5? ⭐ ¡Tus comentarios nos ayudan a mejorar!`;

            try {
                await WhatsAppManager.sendTextMessage(order.customer_phone, message, store.id);
                await this.recordLog(store.id, order.customer_phone, 'order_feedback', order.id);
                console.log(`📲 [Store Follow-up] Encuesta de pedido enviada a ${order.customer_phone}`);
            } catch (e) {
                console.error(`Error enviando encuesta de pedido a ${order.customer_phone}:`, e.message);
            }
        }

        // 2. Auto-cierre de chats inactivos (> 24h)
        db.prepare(`
            UPDATE conversations 
            SET status = 'archived', updated_at = CURRENT_TIMESTAMP
            WHERE store_id = ? AND status = 'active' AND updated_at < datetime('now', '-24 hours')
        `).run(store.id);
    }

    /**
     * Ejecuta todas las automatizaciones pendientes para todos los locales.
     */
    async runAllAutomations() {
        try {
            const stores = Store.getAll();
            for (const store of stores) {
                if (store.hostel_mode === 1 || store.business_type === 'hostel') {
                    await this.processHostelAutomations(store);
                } else if (store.clinic_mode === 1) {
                    await this.processClinicAutomations(store);
                } else {
                    await this.processStoreAutomations(store);
                }
            }
        } catch (e) {
            console.error('❌ Error ejecutando FollowUpService worker:', e.message);
        }
    }

    /**
     * Inicia el trabajador programado (revisa reglas cada 15 minutos por defecto).
     */
    startWorker(intervalMs = 15 * 60 * 1000) {
        if (this.isRunning) return;
        this.isRunning = true;

        console.log('⏰ [FollowUp Worker] Iniciando motor de seguimiento y automatización post-atención...');

        // Ejecución inicial al arrancar tras 10 segundos
        setTimeout(() => {
            this.runAllAutomations().catch(e => console.error("Error running follow-ups:", e.message));
        }, 10000);

        this.workerInterval = setInterval(() => {
            this.runAllAutomations().catch(e => console.error("Error running follow-ups:", e.message));
        }, intervalMs);
    }

    stopWorker() {
        if (this.workerInterval) {
            clearInterval(this.workerInterval);
            this.workerInterval = null;
        }
        this.isRunning = false;
        console.log('🛑 [FollowUp Worker] Motor de seguimiento detenido.');
    }
}

const followUpService = new FollowUpService();
module.exports = followUpService;

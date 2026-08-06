const { getDb } = require('../config/db');
const Customer = require('./Customer');

class Appointment {
    /**
     * Crear una nueva cita.
     */
    static create({ storeId, customerPhone, customerName, service, date, time, duration, notes, doctor = null }) {
        const db = getDb();

        const appointmentNumber = this._generateAppointmentNumber(storeId);
        const total = service.price || 0;

        const result = db.prepare(`
            INSERT INTO appointments (store_id, appointment_number, customer_phone, customer_name, service, doctor, date, time, duration, total, notes, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `).run(
            storeId, appointmentNumber, customerPhone, customerName || '',
            service.name, doctor || null, date, time, duration || 30, total, notes || ''
        );

        // Registrar/Actualizar cliente
        Customer.getOrCreate(storeId, customerPhone, customerName || null);

        return this.getById(result.lastInsertRowid);
    }

    /**
     * Actualizar una cita existente.
     */
    static update(id, { customerPhone, customerName, service, date, time, duration, notes, doctor = null }) {
        const db = getDb();
        const existing = this.getById(id);
        if (!existing) return null;

        const total = service.price || 0;

        db.prepare(`
            UPDATE appointments 
            SET customer_phone = ?, customer_name = ?, service = ?, doctor = ?, date = ?, time = ?, duration = ?, total = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            customerPhone, customerName || '', service.name, doctor || null, date, time, duration || 30, total, notes || '', id
        );

        // Actualizar datos del cliente si cambió nombre
        Customer.getOrCreate(existing.store_id, customerPhone, customerName || null);

        return this.getById(id);
    }

    /**
     * Obtener cita por ID.
     */
    static getById(id) {
        const db = getDb();
        return db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
    }

    /**
     * Obtener citas pendientes de un local.
     */
    static getPending(storeId) {
        const db = getDb();
        return db.prepare(`
            SELECT * FROM appointments 
            WHERE store_id = ? AND status = 'pending'
            ORDER BY date ASC, time ASC
        `).all(storeId);
    }

    /**
     * Obtener citas de hoy.
     */
    static getToday(storeId) {
        const db = getDb();
        const today = new Date().toISOString().split('T')[0];
        return db.prepare(`
            SELECT * FROM appointments 
            WHERE store_id = ? AND date = ?
            ORDER BY time ASC
        `).all(storeId, today);
    }

    /**
     * Confirmar cita.
     */
    static confirm(id) {
        const db = getDb();
        db.prepare(`
            UPDATE appointments 
            SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(id);
        return this.getById(id);
    }

    /**
     * Completar cita (atendida).
     */
    static complete(id) {
        const db = getDb();
        db.prepare(`
            UPDATE appointments 
            SET status = 'completed', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(id);
        return this.getById(id);
    }

    /**
     * Cancelar cita.
     */
    static cancel(id, reason = '') {
        const db = getDb();
        db.prepare(`
            UPDATE appointments 
            SET status = 'cancelled', notes = CASE WHEN notes = '' THEN ? ELSE notes || ' | Cancelación: ' || ? END, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(reason, reason, id);
        return this.getById(id);
    }

    /**
     * Reagendar cita.
     */
    static reschedule(id, newDate, newTime) {
        const db = getDb();
        db.prepare(`
            UPDATE appointments 
            SET date = ?, time = ?, status = 'pending', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(newDate, newTime, id);
        return this.getById(id);
    }

    /**
     * Obtener historial de citas de un local.
     */
    static getHistory(storeId, limit = 50) {
        const db = getDb();
        return db.prepare(`
            SELECT * FROM appointments 
            WHERE store_id = ?
            ORDER BY date DESC, time DESC
            LIMIT ?
        `).all(storeId, limit);
    }

    /**
     * Obtener citas de un cliente específico.
     */
    static getCustomerAppointments(storeId, customerPhone) {
        const db = getDb();
        return db.prepare(`
            SELECT * FROM appointments 
            WHERE store_id = ? AND customer_phone = ?
            ORDER BY date DESC, time DESC
            LIMIT 10
        `).all(storeId, customerPhone);
    }

    /**
     * Verificar disponibilidad de horario.
     */
    static isAvailable(storeId, date, time, excludeId = null) {
        const db = getDb();
        let query = `
            SELECT COUNT(*) as count FROM appointments 
            WHERE store_id = ? AND date = ? AND time = ? AND status IN ('pending', 'confirmed')
        `;
        const params = [storeId, date, time];

        if (excludeId) {
            query += ' AND id != ?';
            params.push(excludeId);
        }

        const result = db.prepare(query).get(...params);
        return result.count === 0;
    }

    /**
     * Obtener horarios disponibles para una fecha.
     */
    static getAvailableSlots(storeId, date) {
        const db = getDb();
        
        // Obtener configuración de la clínica
        const store = db.prepare('SELECT working_hours, slot_duration FROM stores WHERE id = ?').get(storeId);
        if (!store) return [];
        
        const workingHours = store.working_hours || '08:00-20:00';
        const slotDuration = parseInt(store.slot_duration) || 30;
        
        const booked = db.prepare(`
            SELECT time FROM appointments 
            WHERE store_id = ? AND date = ? AND status IN ('pending', 'confirmed')
        `).all(storeId, date);

        const bookedTimes = booked.map(b => b.time);

        const allSlots = [];
        const ranges = workingHours.split(',').map(r => r.trim()).filter(Boolean);
        
        for (const range of ranges) {
            const parts = range.split('-');
            if (parts.length !== 2) continue;
            
            const startStr = parts[0].trim();
            const endStr = parts[1].trim();
            
            const startParts = startStr.split(':');
            const endParts = endStr.split(':');
            
            if (startParts.length !== 2 || endParts.length !== 2) continue;
            
            const [startHour, startMin] = startParts.map(Number);
            const [endHour, endMin] = endParts.map(Number);
            
            if (isNaN(startHour) || isNaN(startMin) || isNaN(endHour) || isNaN(endMin)) continue;

            let currentTotalMinutes = startHour * 60 + startMin;
            const endTotalMinutes = endHour * 60 + endMin;
            
            while (currentTotalMinutes + slotDuration <= endTotalMinutes) {
                const h = Math.floor(currentTotalMinutes / 60);
                const m = currentTotalMinutes % 60;
                const timeString = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                
                // Avoid duplicates in case ranges overlap
                if (!allSlots.includes(timeString)) {
                    allSlots.push(timeString);
                }
                
                currentTotalMinutes += slotDuration;
            }
        }
        
        // Sort slots chronologically just in case ranges are out of order
        allSlots.sort((a, b) => {
            const [aH, aM] = a.split(':').map(Number);
            const [bH, bM] = b.split(':').map(Number);
            return (aH * 60 + aM) - (bH * 60 + bM);
        });

        // Si la fecha es hoy, filtrar horarios que ya pasaron
        const today = new Date();
        const isToday = date === today.toISOString().split('T')[0];
        const currentHour = today.getHours();
        const currentMinute = today.getMinutes();
        const nowTotalMinutes = currentHour * 60 + currentMinute;

        return allSlots.map(slot => {
            const [sh, sm] = slot.split(':').map(Number);
            const slotTotalMin = sh * 60 + sm;
            
            let isAvailable = !bookedTimes.includes(slot);
            
            // Si es hoy y la hora ya pasó, no está disponible
            if (isAvailable && isToday && slotTotalMin <= nowTotalMinutes) {
                isAvailable = false;
            }
            
            return {
                time: slot,
                available: isAvailable
            };
        });
    }

    /**
     * Obtener historial de citas formateado para la IA.
     */
    static getCustomerHistoryText(storeId, customerPhone) {
        const db = getDb();

        const customer = db.prepare('SELECT name, bot_notes FROM customers WHERE phone = ? AND store_id = ?').get(customerPhone, storeId);
        let profileText = '';
        if (customer && customer.bot_notes) {
            profileText = `[NOTAS INTERNAS SOBRE EL CLIENTE (MÁXIMA PRIORIDAD): ${customer.bot_notes}]\n`;
        }
        if (customer && customer.name) {
            profileText += `Nombre del cliente: ${customer.name}\n`;
        }

        const appointments = db.prepare(`
            SELECT id, service, date, time, status FROM appointments
            WHERE customer_phone = ? AND store_id = ?
            ORDER BY date DESC, time DESC
            LIMIT 5
        `).all(customerPhone, storeId);

        if (appointments.length === 0) {
            return profileText + 'Historial de citas: Este es un cliente nuevo, no tiene citas anteriores registradas.';
        }

        let text = profileText + 'Citas recientes del cliente:\n';
        appointments.forEach(apt => {
            const dateStr = new Date(apt.date).toLocaleDateString('es-UY');
            text += `- ${apt.service} (${dateStr} a las ${apt.time}) - Estado: ${apt.status}\n`;
        });

        return text;
    }

    /**
     * Obtener servicios disponibles de un local.
     */
    static getServices(storeId) {
        const Product = require('./Product');
        const products = Product.getByStoreId(storeId, true);
        return products.map(p => ({
            name: p.name,
            price: p.price,
            duration: p.duration || 30,
            description: p.description || ''
        }));
    }

    static _generateAppointmentNumber(storeId) {
        const db = getDb();
        const today = new Date().toISOString().split('T')[0];
        const result = db.prepare(`
            SELECT MAX(CAST(SUBSTR(appointment_number, 5) AS INTEGER)) as max_num FROM appointments 
            WHERE store_id = ? AND DATE(created_at) = ?
        `).get(storeId, today);
        return `CIT-${String((result.max_num || 0) + 1).padStart(4, '0')}`;
    }
}

module.exports = Appointment;

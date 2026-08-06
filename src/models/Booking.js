const { getDb } = require('../config/db');
const Customer = require('./Customer');
const Room = require('./Room');

class Booking {
    /**
     * Generar número de reserva único por tienda.
     */
    static _generateBookingNumber(storeId) {
        const db = getDb();
        const last = db.prepare('SELECT id FROM bookings WHERE store_id = ? ORDER BY id DESC LIMIT 1').get(storeId);
        const nextId = last ? last.id + 1 : 1;
        return `HST-${1000 + nextId}`;
    }

    /**
     * Calcular cantidad de noches entre dos fechas (YYYY-MM-DD).
     */
    static calculateNights(checkIn, checkOut) {
        try {
            const start = new Date(checkIn);
            const end = new Date(checkOut);
            const diffTime = end - start;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays > 0 ? diffDays : 1;
        } catch (e) {
            return 1;
        }
    }

    /**
     * Verificar cuántas unidades de una habitación están reservadas en un rango de fechas.
     */
    static getOccupiedUnits(storeId, roomId, checkIn, checkOut) {
        const db = getDb();
        // Una reserva se solapa si check_in_date < checkOut AND check_out_date > checkIn
        const result = db.prepare(`
            SELECT COUNT(*) as count FROM bookings 
            WHERE store_id = ? AND room_id = ? 
            AND status IN ('pending', 'confirmed', 'checked_in')
            AND check_in_date < ? AND check_out_date > ?
        `).get(storeId, roomId, checkOut, checkIn);
        return result ? result.count : 0;
    }

    /**
     * Consultar todas las habitaciones con su disponibilidad real para un rango de fechas.
     */
    static getAvailableRoomsForDates(storeId, checkIn, checkOut, pax = 1) {
        const rooms = Room.getByStoreId(storeId, true);
        const nights = this.calculateNights(checkIn, checkOut);

        return rooms.map(room => {
            const occupied = this.getOccupiedUnits(storeId, room.id, checkIn, checkOut);
            const availableUnits = room.total_units - occupied;
            const meetsCapacity = room.capacity >= pax;
            const isAvailable = availableUnits > 0 && meetsCapacity;

            return {
                id: room.id,
                name: room.name,
                room_type: room.room_type,
                capacity: room.capacity,
                price_per_night: room.price_per_night,
                total_nights: nights,
                total_price: room.price_per_night * nights,
                available_units: availableUnits > 0 ? availableUnits : 0,
                is_available: isAvailable
            };
        });
    }

    /**
     * Crear nueva reserva.
     */
    static create({ storeId, customerPhone, customerName, roomId, roomName, checkInDate, checkOutDate, guestsCount, totalPrice, paymentMethod, notes, passportInfo }) {
        const db = getDb();
        const bookingNumber = this._generateBookingNumber(storeId);
        
        let finalRoomName = roomName;
        let finalTotalPrice = totalPrice;

        if (roomId && (!finalRoomName || !finalTotalPrice)) {
            const room = Room.getById(roomId);
            if (room) {
                if (!finalRoomName) finalRoomName = room.name;
                if (!finalTotalPrice) {
                    const nights = this.calculateNights(checkInDate, checkOutDate);
                    finalTotalPrice = room.price_per_night * nights;
                }
            }
        }

        const result = db.prepare(`
            INSERT INTO bookings (
                store_id, booking_number, customer_phone, customer_name, 
                room_id, room_name, check_in_date, check_out_date, 
                guests_count, total_price, payment_status, status, 
                payment_method, notes, passport_info
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', ?, ?, ?)
        `).run(
            storeId, bookingNumber, customerPhone, customerName || '',
            roomId || null, finalRoomName || 'Habitación General',
            checkInDate, checkOutDate, guestsCount || 1, finalTotalPrice || 0,
            paymentMethod || 'Efectivo', notes || '', passportInfo || ''
        );

        // Registrar/Actualizar en CRM
        Customer.getOrCreate(storeId, customerPhone, customerName || null);

        return this.getById(result.lastInsertRowid);
    }

    /**
     * Obtener por ID.
     */
    static getById(id) {
        const db = getDb();
        return db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    }

    /**
     * Obtener reservas de una tienda con opción de filtrar por estado o fecha.
     */
    static getByStoreId(storeId, { status, date } = {}) {
        const db = getDb();
        let query = 'SELECT * FROM bookings WHERE store_id = ?';
        const params = [storeId];

        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }
        if (date) {
            query += ' AND (check_in_date = ? OR check_out_date = ?)';
            params.push(date, date);
        }

        query += ' ORDER BY id DESC';
        return db.prepare(query).all(...params);
    }

    /**
     * Actualizar estado de una reserva (confirmed, checked_in, checked_out, cancelled).
     */
    static updateStatus(id, status) {
        const db = getDb();
        db.prepare('UPDATE bookings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
        return this.getById(id);
    }

    /**
     * Actualizar reserva.
     */
    static update(id, data) {
        const db = getDb();
        const fields = [];
        const values = [];

        if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
        if (data.payment_status !== undefined) { fields.push('payment_status = ?'); values.push(data.payment_status); }
        if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes); }
        if (data.passport_info !== undefined) { fields.push('passport_info = ?'); values.push(data.passport_info); }
        if (data.customer_name !== undefined) { fields.push('customer_name = ?'); values.push(data.customer_name); }

        if (fields.length === 0) return this.getById(id);

        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        db.prepare(`UPDATE bookings SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        return this.getById(id);
    }

    /**
     * Obtener texto de historial de un cliente para inyectar al Agente IA.
     */
    static getCustomerHistoryText(storeId, customerPhone) {
        const db = getDb();
        const bookings = db.prepare(`
            SELECT * FROM bookings 
            WHERE store_id = ? AND customer_phone = ? 
            ORDER BY id DESC LIMIT 3
        `).all(storeId, customerPhone);

        if (bookings.length === 0) {
            return 'Este cliente no tiene reservas previas.';
        }

        let text = 'RESERVAS PREVIAS DE ESTE CLIENTE:\n';
        bookings.forEach(b => {
            text += `- Reserva ${b.booking_number}: ${b.room_name} (${b.check_in_date} al ${b.check_out_date}) - Estado: ${b.status}\n`;
        });
        return text;
    }
}

module.exports = Booking;

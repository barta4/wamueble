const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /api/bookings
 * Listar reservas del hostel.
 */
router.get('/', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const { status, date } = req.query;
        const bookings = Booking.getByStoreId(storeId, { status, date });
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/bookings/availability
 * Consultar disponibilidad por rango de fechas.
 */
router.get('/availability', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const { check_in, check_out, pax } = req.query;

        if (!check_in || !check_out) {
            return res.status(400).json({ error: 'check_in y check_out son requeridos' });
        }

        const rooms = Booking.getAvailableRoomsForDates(storeId, check_in, check_out, parseInt(pax) || 1);
        res.json({ check_in, check_out, rooms });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/bookings/:id
 * Obtener una reserva por ID.
 */
router.get('/:id', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const booking = Booking.getById(req.params.id);
        if (!booking) return res.status(404).json({ error: 'Reserva no encontrada' });
        if (booking.store_id !== storeId) return res.status(403).json({ error: 'Acceso denegado' });
        res.json(booking);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/bookings
 * Crear una reserva manualmente desde el dashboard.
 */
router.post('/', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const { customer_phone, customer_name, room_id, room_name, check_in_date, check_out_date, guests_count, total_price, payment_method, notes } = req.body;

        if (!customer_phone || !check_in_date || !check_out_date) {
            return res.status(400).json({ error: 'Teléfono, fecha de ingreso y de salida son obligatorios' });
        }

        const booking = Booking.create({
            storeId,
            customerPhone: customer_phone,
            customerName: customer_name || '',
            roomId: room_id ? parseInt(room_id) : null,
            roomName: room_name || 'Habitación General',
            checkInDate: check_in_date,
            checkOutDate: check_out_date,
            guestsCount: parseInt(guests_count) || 1,
            totalPrice: parseFloat(total_price) || 0,
            paymentMethod: payment_method || 'Efectivo',
            notes: notes || ''
        });

        // Emitir vía WebSockets
        const io = req.app.get('io');
        if (io) {
            io.to('admin').emit('nueva-reserva-hostel', booking);
        }

        res.status(201).json(booking);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/bookings/:id/status
 * Actualizar el estado de una reserva (confirmed, checked_in, checked_out, cancelled).
 */
router.put('/:id/status', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const booking = Booking.getById(req.params.id);
        if (!booking) return res.status(404).json({ error: 'Reserva no encontrada' });
        if (booking.store_id !== storeId) return res.status(403).json({ error: 'Acceso denegado' });

        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'Estado no proporcionado' });

        const updated = Booking.updateStatus(req.params.id, status);

        const io = req.app.get('io');
        if (io) {
            io.to('admin').emit('reserva-hostel-actualizada', updated);
        }

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/bookings/:id
 * Actualizar datos de una reserva.
 */
router.put('/:id', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const booking = Booking.getById(req.params.id);
        if (!booking) return res.status(404).json({ error: 'Reserva no encontrada' });
        if (booking.store_id !== storeId) return res.status(403).json({ error: 'Acceso denegado' });

        const updated = Booking.update(req.params.id, req.body);

        const io = req.app.get('io');
        if (io) {
            io.to('admin').emit('reserva-hostel-actualizada', updated);
        }

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

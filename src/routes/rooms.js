const express = require('express');
const router = express.Router();
const Room = require('../models/Room');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /api/rooms
 * Listar todas las habitaciones del hostel.
 */
router.get('/', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const rooms = Room.getByStoreId(storeId, false);
        res.json(rooms);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/rooms/types
 * Listar los tipos de habitación disponibles para la tienda.
 */
router.get('/types', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const types = Room.getRoomTypes(storeId);
        res.json(types);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/rooms/types
 * Crear un nuevo tipo de habitación.
 */
router.post('/types', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'El nombre del tipo de habitación es obligatorio' });
        }

        const currentTypes = Room.getRoomTypes(storeId);
        const newId = 'type_' + Date.now();
        currentTypes.push({ id: newId, name: name.trim() });

        const updated = Room.saveRoomTypes(storeId, currentTypes);
        res.status(201).json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/rooms/types/:typeId
 * Editar un tipo de habitación existente.
 */
router.put('/types/:typeId', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const { typeId } = req.params;
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'El nombre del tipo de habitación es obligatorio' });
        }

        const currentTypes = Room.getRoomTypes(storeId);
        const item = currentTypes.find(t => t.id === typeId);
        if (!item) return res.status(404).json({ error: 'Tipo de habitación no encontrado' });

        item.name = name.trim();
        const updated = Room.saveRoomTypes(storeId, currentTypes);
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/rooms/types/:typeId
 * Eliminar un tipo de habitación.
 */
router.delete('/types/:typeId', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const { typeId } = req.params;

        let currentTypes = Room.getRoomTypes(storeId);
        const filtered = currentTypes.filter(t => t.id !== typeId);

        const updated = Room.saveRoomTypes(storeId, filtered);
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/rooms/:id
 * Obtener una habitación por ID.
 */
router.get('/:id', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const room = Room.getById(req.params.id);
        if (!room) return res.status(404).json({ error: 'Habitación no encontrada' });
        if (room.store_id !== storeId) return res.status(403).json({ error: 'Acceso denegado' });
        res.json(room);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/rooms
 * Crear una nueva habitación / dorm.
 */
router.post('/', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const { name, description, room_type, capacity, price_per_night, total_units } = req.body;

        if (!name || price_per_night === undefined || isNaN(parseFloat(price_per_night))) {
            return res.status(400).json({ error: 'Nombre y precio por noche son obligatorios' });
        }

        const room = Room.create({
            storeId,
            name,
            description: description || '',
            roomType: room_type || 'shared_dorm',
            capacity: parseInt(capacity) || 1,
            pricePerNight: parseFloat(price_per_night),
            totalUnits: parseInt(total_units) || 1
        });

        res.status(201).json(room);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/rooms/:id
 * Actualizar una habitación.
 */
router.put('/:id', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const room = Room.getById(req.params.id);
        if (!room) return res.status(404).json({ error: 'Habitación no encontrada' });
        if (room.store_id !== storeId) return res.status(403).json({ error: 'Acceso denegado' });

        const updated = Room.update(req.params.id, req.body);
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/rooms/:id
 * Eliminar (desactivar) una habitación.
 */
router.delete('/:id', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const room = Room.getById(req.params.id);
        if (!room) return res.status(404).json({ error: 'Habitación no encontrada' });
        if (room.store_id !== storeId) return res.status(403).json({ error: 'Acceso denegado' });

        Room.delete(req.params.id);
        res.json({ success: true, message: 'Habitación desactivada correctamente' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

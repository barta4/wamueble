const express = require('express');
const router = express.Router();
const Driver = require('../models/Driver');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /api/drivers
 * Listar repartidores activos del local.
 */
router.get('/', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const drivers = Driver.getByStoreId(storeId);
        res.json(drivers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/drivers
 * Crear un nuevo repartidor.
 */
router.post('/', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const { name, phone } = req.body;

        if (!name || !phone) {
            return res.status(400).json({ error: 'Nombre y teléfono son obligatorios' });
        }

        const driver = Driver.create({ storeId, name, phone });
        res.status(201).json(driver);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/drivers/:id
 * Actualizar repartidor.
 */
router.put('/:id', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const existing = Driver.getById(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Repartidor no encontrado' });
        if (existing.store_id !== storeId) return res.status(403).json({ error: 'Acceso denegado' });

        const { name, phone } = req.body;
        if (!name || !phone) {
            return res.status(400).json({ error: 'Nombre y teléfono son obligatorios' });
        }

        const driver = Driver.update(req.params.id, { name, phone });
        res.json(driver);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PATCH /api/drivers/:id/toggle
 * Activar/desactivar repartidor.
 */
router.patch('/:id/toggle', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const existing = Driver.getById(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Repartidor no encontrado' });
        if (existing.store_id !== storeId) return res.status(403).json({ error: 'Acceso denegado' });

        const driver = Driver.toggleActive(req.params.id);
        res.json(driver);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/drivers/:id
 * Eliminar repartidor.
 */
router.delete('/:id', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const existing = Driver.getById(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Repartidor no encontrado' });
        if (existing.store_id !== storeId) return res.status(403).json({ error: 'Acceso denegado' });

        const result = Driver.delete(req.params.id);
        if (result.changes === 0) return res.status(404).json({ error: 'Repartidor no encontrado' });
        res.json({ message: 'Repartidor eliminado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

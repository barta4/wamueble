const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Product = require('../models/Product');
const { requireAuth } = require('../middleware/auth');

// Configuración de Multer para imágenes de productos
const mediaDir = path.join(__dirname, '..', '..', 'data', 'media');
if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, mediaDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        const uniqueName = `product_${Date.now()}_${Math.round(Math.random() * 1E9)}${ext}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // Max 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos de imagen'));
        }
    }
});

/**
 * GET /api/products
 * Listar todos los productos del local.
 */
router.get('/', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const products = Product.getByStoreId(storeId);
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/products/:id
 * Obtener un producto por ID.
 */
router.get('/:id', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const product = Product.getById(req.params.id);
        if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
        if (product.store_id !== storeId) return res.status(403).json({ error: 'Acceso denegado' });
        res.json(product);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/products
 * Crear un nuevo producto (soporta upload.single('image')).
 */
router.post('/', requireAuth, upload.single('image'), (req, res) => {
    try {
        const storeId = req.user.store_id;
        const { name, description, price, category, duration, is_service } = req.body;

        if (!name || price === undefined || price === null || isNaN(parseFloat(price))) {
            return res.status(400).json({ error: 'Nombre y precio son obligatorios' });
        }

        let image_path = null;
        if (req.file) {
            image_path = `/media/${req.file.filename}`;
        }

        const product = Product.create({
            storeId,
            name,
            description: description || '',
            price: parseFloat(price),
            category: category || 'General',
            duration: duration ? parseInt(duration) : 30,
            is_service: is_service === true || is_service === 1 || is_service === 'true',
            image_path
        });

        res.status(201).json(product);
    } catch (error) {
        console.error("Error saving product:", error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/products/:id
 * Actualizar un producto existente (soporta upload.single('image')).
 */
router.put('/:id', requireAuth, upload.single('image'), (req, res) => {
    try {
        const storeId = req.user.store_id;
        const existing = Product.getById(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });
        if (existing.store_id !== storeId) return res.status(403).json({ error: 'Acceso denegado' });

        const { name, description, price, category, duration, is_service } = req.body;

        if (!name || price === undefined || price === null || isNaN(parseFloat(price))) {
            return res.status(400).json({ error: 'Nombre y precio son obligatorios' });
        }

        let image_path = undefined;
        if (req.file) {
            image_path = `/media/${req.file.filename}`;
        }

        const product = Product.update(req.params.id, storeId, {
            name,
            description: description || '',
            price: parseFloat(price),
            category: category || 'General',
            duration: duration ? parseInt(duration) : 30,
            is_service: is_service !== undefined ? (is_service === true || is_service === 1 || is_service === 'true') : existing.is_service,
            image_path
        });

        res.json(product);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PATCH /api/products/:id/toggle
 * Activar/pausar un producto.
 */
router.patch('/:id/toggle', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const existing = Product.getById(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });
        if (existing.store_id !== storeId) return res.status(403).json({ error: 'Acceso denegado' });

        const product = Product.toggleAvailable(req.params.id, storeId);
        res.json(product);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/products/:id
 * Eliminar un producto.
 */
router.delete('/:id', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const existing = Product.getById(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });
        if (existing.store_id !== storeId) return res.status(403).json({ error: 'Acceso denegado' });

        const result = Product.delete(req.params.id, storeId);
        if (result.changes === 0) return res.status(404).json({ error: 'Producto no encontrado' });
        res.json({ message: 'Producto eliminado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

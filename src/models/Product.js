const { getDb } = require('../config/db');

class Product {
    /**
     * Obtener todos los productos de un local.
     */
    static getByStoreId(storeId, onlyAvailable = false) {
        const db = getDb();
        const where = onlyAvailable ? 'AND available = 1' : '';
        return db.prepare(`
            SELECT * FROM products 
            WHERE store_id = ? ${where}
            ORDER BY category, name
        `).all(storeId);
    }

    /**
     * Obtener un producto por ID.
     */
    static getById(id) {
        const db = getDb();
        return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    }

    /**
     * Obtener un producto por nombre en un store específico.
     */
    static getByName(storeId, name) {
        const db = getDb();
        return db.prepare('SELECT * FROM products WHERE store_id = ? AND name = ?').get(storeId, name);
    }

    /**
     * Crear un nuevo producto/servicio.
     */
    static create({ storeId, name, description, price, category, available, duration, is_service, image_path, sku, prices_json }) {
        const db = getDb();
        const skuVal = sku ? String(sku).trim() : '';
        const pricesJsonVal = typeof prices_json === 'object' ? JSON.stringify(prices_json) : (prices_json || '[]');
        const availableVal = available !== undefined ? (available === true || available === 1 || available === '1' || available === 'true' ? 1 : 0) : 1;
        
        const result = db.prepare(`
            INSERT INTO products (store_id, name, description, price, category, available, duration, is_service, image_path, sku, prices_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            storeId, 
            name, 
            description || '', 
            price, 
            category || 'General', 
            availableVal,
            duration || 30, 
            is_service ? 1 : 0, 
            image_path || null,
            skuVal,
            pricesJsonVal
        );
        return this.getById(result.lastInsertRowid);
    }

    /**
     * Actualizar un producto existente.
     */
    static update(id, storeId, { name, description, price, category, available, duration, is_service, image_path, sku, prices_json }) {
        const db = getDb();
        const skuVal = sku !== undefined ? String(sku).trim() : null;
        const pricesJsonVal = prices_json !== undefined 
            ? (typeof prices_json === 'object' ? JSON.stringify(prices_json) : String(prices_json))
            : null;

        if (storeId) {
            db.prepare(`
                UPDATE products 
                SET name = ?, description = ?, price = ?, category = ?, available = ?, duration = ?, is_service = ?, 
                    image_path = COALESCE(?, image_path), 
                    sku = COALESCE(?, sku), 
                    prices_json = COALESCE(?, prices_json), 
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND store_id = ?
            `).run(
                name, 
                description || '', 
                price, 
                category || 'General', 
                available !== undefined ? available : 1, 
                duration || 30, 
                is_service ? 1 : 0, 
                image_path !== undefined ? image_path : null, 
                skuVal, 
                pricesJsonVal, 
                id, 
                storeId
            );
        } else {
            db.prepare(`
                UPDATE products 
                SET name = ?, description = ?, price = ?, category = ?, available = ?, duration = ?, is_service = ?, 
                    image_path = COALESCE(?, image_path), 
                    sku = COALESCE(?, sku), 
                    prices_json = COALESCE(?, prices_json), 
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(
                name, 
                description || '', 
                price, 
                category || 'General', 
                available !== undefined ? available : 1, 
                duration || 30, 
                is_service ? 1 : 0, 
                image_path !== undefined ? image_path : null, 
                skuVal, 
                pricesJsonVal, 
                id
            );
        }
        return this.getById(id);
    }

    /**
     * Activar o pausar un producto (toggle disponibilidad).
     */
    static toggleAvailable(id, storeId = null) {
        const db = getDb();
        if (storeId) {
            db.prepare(`
                UPDATE products 
                SET available = CASE WHEN available = 1 THEN 0 ELSE 1 END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND store_id = ?
            `).run(id, storeId);
        } else {
            db.prepare(`
                UPDATE products 
                SET available = CASE WHEN available = 1 THEN 0 ELSE 1 END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(id);
        }
        return this.getById(id);
    }

    /**
     * Eliminar un producto.
     */
    static delete(id, storeId = null) {
        const db = getDb();
        if (storeId) {
            return db.prepare('DELETE FROM products WHERE id = ? AND store_id = ?').run(id, storeId);
        }
        return db.prepare('DELETE FROM products WHERE id = ?').run(id);
    }

    /**
     * Obtener catálogo formateado como texto para el agente IA.
     * Solo productos disponibles.
     */
    static getCatalogText(storeId) {
        const products = this.getByStoreId(storeId, true);
        if (products.length === 0) return 'No hay productos disponibles en este momento.';

        const grouped = {};
        for (const p of products) {
            if (!grouped[p.category]) grouped[p.category] = [];
            grouped[p.category].push(p);
        }

        let text = '📋 CATÁLOGO / SERVICIOS:\n\n';
        for (const [category, items] of Object.entries(grouped)) {
            text += `── ${category.toUpperCase()} ──\n`;
            for (const item of items) {
                text += `• ${item.name} — $${item.price}`;
                if (item.sku) text += ` [Cód: ${item.sku}]`;

                if (item.prices_json) {
                    try {
                        const parsedPrices = typeof item.prices_json === 'string' ? JSON.parse(item.prices_json) : item.prices_json;
                        if (Array.isArray(parsedPrices) && parsedPrices.length > 0) {
                            const variantStr = parsedPrices.map(v => `${v.label || v.name}: $${v.price}`).join(', ');
                            text += ` (Opciones/Variantes: ${variantStr})`;
                        }
                    } catch (e) {}
                }

                if (item.image_path) text += ' [TIENE FOTO DISPONIBLE]';
                if (item.duration && item.duration > 0) text += ` (⏱️ ${item.duration} min)`;
                if (item.description) text += `\n  Descripción: ${item.description}`;
                text += '\n';
            }
            text += '\n';
        }
        return text;
    }
}

module.exports = Product;

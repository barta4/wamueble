const { getDb } = require('../config/db');

class Customer {
    /**
     * Obtener o crear un cliente por su teléfono.
     */
    static getOrCreate(storeId, phone, name = null) {
        const db = getDb();
        const existing = db.prepare('SELECT * FROM customers WHERE store_id = ? AND phone = ?').get(storeId, phone);
        if (existing) {
            // Actualizar nombre si WhatsApp nos envía uno nuevo o si no tenía nombre
            if (name && name !== existing.name) {
                db.prepare('UPDATE customers SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name, existing.id);
                existing.name = name;
            }
            return existing;
        }

        const result = db.prepare(`
            INSERT INTO customers (store_id, phone, name)
            VALUES (?, ?, ?)
        `).run(storeId, phone, name);
        
        return this.getById(result.lastInsertRowid);
    }

    /**
     * Obtener por ID
     */
    static getById(id) {
        return getDb().prepare('SELECT * FROM customers WHERE id = ?').get(id);
    }

    /**
     * Obtener por teléfono
     */
    static getByPhone(storeId, phone) {
        return getDb().prepare('SELECT * FROM customers WHERE store_id = ? AND phone = ?').get(storeId, phone);
    }

    /**
     * Obtener todos los clientes de una tienda
     */
    static getAll(storeId) {
        return getDb().prepare('SELECT * FROM customers WHERE store_id = ? ORDER BY total_orders DESC').all(storeId);
    }

    /**
     * Actualizar estadísticas de un cliente tras un pedido.
     */
    static updateStats(storeId, phone, totalSpent) {
        const db = getDb();
        db.prepare(`
            UPDATE customers 
            SET total_orders = total_orders + 1,
                total_spent = total_spent + ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE store_id = ? AND phone = ?
        `).run(totalSpent, storeId, phone);
    }

    /**
     * Actualizar perfil (nombre, notas y agente de IA asignado).
     */
    static updateProfile(storeId, phone, data) {
        const db = getDb();
        const fields = [];
        const values = [];

        if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
        if (data.bot_notes !== undefined) { fields.push('bot_notes = ?'); values.push(data.bot_notes); }
        if (data.ai_provider !== undefined) { fields.push('ai_provider = ?'); values.push(data.ai_provider); }

        if (fields.length === 0) return this.getByPhone(storeId, phone);

        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(storeId, phone);

        db.prepare(`UPDATE customers SET ${fields.join(', ')} WHERE store_id = ? AND phone = ?`).run(...values);
        return this.getByPhone(storeId, phone);
    }

    /**
     * Actualizar solo las notas del bot para un cliente.
     */
    static updateNotes(storeId, phone, notes) {
        const db = getDb();
        db.prepare(`
            UPDATE customers SET bot_notes = ?, updated_at = CURRENT_TIMESTAMP
            WHERE store_id = ? AND phone = ?
        `).run(notes || '', storeId, phone);
    }

    /**
     * Obtener el historial de pedidos de un cliente.
     */
    /**
     * Crear manualmente un cliente en la BD.
     */
    static create({ storeId, phone, name, botNotes = '' }) {
        const db = getDb();
        const existing = this.getByPhone(storeId, phone);
        if (existing) {
            this.updateProfile(storeId, phone, { name, bot_notes: botNotes });
            return this.getByPhone(storeId, phone);
        }

        const result = db.prepare(`
            INSERT INTO customers (store_id, phone, name, bot_notes)
            VALUES (?, ?, ?, ?)
        `).run(storeId, phone, name || null, botNotes || '');

        return this.getById(result.lastInsertRowid);
    }

    /**
     * Eliminar un cliente.
     */
    static delete(storeId, phone) {
        const db = getDb();
        return db.prepare('DELETE FROM customers WHERE store_id = ? AND phone = ?').run(storeId, phone);
    }
}

module.exports = Customer;

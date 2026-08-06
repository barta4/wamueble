const { getDb } = require('../config/db');

class Driver {
    /**
     * Obtener todos los repartidores activos de un local.
     */
    static getByStoreId(storeId) {
        const db = getDb();
        return db.prepare(
            'SELECT * FROM delivery_drivers WHERE store_id = ? AND active = 1 ORDER BY name'
        ).all(storeId);
    }

    /**
     * Obtener repartidor por ID.
     */
    static getById(id) {
        const db = getDb();
        return db.prepare('SELECT * FROM delivery_drivers WHERE id = ?').get(id);
    }

    /**
     * Crear un nuevo repartidor.
     */
    static create({ storeId, name, phone }) {
        const db = getDb();
        const result = db.prepare(
            'INSERT INTO delivery_drivers (store_id, name, phone) VALUES (?, ?, ?)'
        ).run(storeId, name, phone);
        return this.getById(result.lastInsertRowid);
    }

    /**
     * Actualizar datos de un repartidor.
     */
    static update(id, { name, phone }) {
        const db = getDb();
        db.prepare(
            'UPDATE delivery_drivers SET name = ?, phone = ? WHERE id = ?'
        ).run(name, phone, id);
        return this.getById(id);
    }

    /**
     * Activar/desactivar repartidor.
     */
    static toggleActive(id) {
        const db = getDb();
        db.prepare(
            'UPDATE delivery_drivers SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ?'
        ).run(id);
        return this.getById(id);
    }

    /**
     * Eliminar repartidor.
     */
    static delete(id) {
        const db = getDb();
        return db.prepare('DELETE FROM delivery_drivers WHERE id = ?').run(id);
    }
}

module.exports = Driver;

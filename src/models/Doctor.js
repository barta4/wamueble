const { getDb } = require('../config/db');

class Doctor {
    static getByStoreId(storeId, activeOnly = true) {
        const db = getDb();
        if (activeOnly) {
            return db.prepare('SELECT * FROM doctors WHERE store_id = ? AND active = 1 ORDER BY name').all(storeId);
        }
        return db.prepare('SELECT * FROM doctors WHERE store_id = ? ORDER BY name').all(storeId);
    }

    static getById(id) {
        const db = getDb();
        return db.prepare('SELECT * FROM doctors WHERE id = ?').get(id);
    }

    static create({ storeId, name, specialty }) {
        const db = getDb();
        const result = db.prepare(`
            INSERT INTO doctors (store_id, name, specialty, active)
            VALUES (?, ?, ?, 1)
        `).run(storeId, name, specialty || '');
        return this.getById(result.lastInsertRowid);
    }

    static update(id, { name, specialty, active }) {
        const db = getDb();
        db.prepare(`
            UPDATE doctors 
            SET name = ?, specialty = ?, active = ?
            WHERE id = ?
        `).run(name, specialty || '', active === undefined ? 1 : active, id);
        return this.getById(id);
    }

    static delete(id) {
        const db = getDb();
        db.prepare('DELETE FROM doctors WHERE id = ?').run(id);
        return true;
    }
}

module.exports = Doctor;

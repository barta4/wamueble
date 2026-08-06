const { getDb } = require('../config/db');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

class User {
    /**
     * Crear un nuevo usuario.
     */
    static async create({ email, password, name, role = 'owner', storeId = null }) {
        const db = getDb();
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        
        const result = db.prepare(`
            INSERT INTO users (email, password_hash, name, role, store_id)
            VALUES (?, ?, ?, ?, ?)
        `).run(email.toLowerCase().trim(), passwordHash, name, role, storeId);
        
        return this.getById(result.lastInsertRowid);
    }

    /**
     * Buscar usuario por email.
     */
    static findByEmail(email) {
        const db = getDb();
        return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
    }

    /**
     * Verificar credenciales de login.
     */
    static async verifyPassword(email, password) {
        const user = this.findByEmail(email);
        if (!user) return null;
        
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return null;
        
        return user;
    }

    /**
     * Obtener usuario por ID.
     */
    static getById(id) {
        const db = getDb();
        return db.prepare('SELECT id, email, name, role, store_id, plan, plan_expires_at, created_at FROM users WHERE id = ?').get(id);
    }

    /**
     * Actualizar usuario.
     */
    static update(id, data) {
        const db = getDb();
        const fields = [];
        const values = [];
        
        if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
        if (data.email !== undefined) { fields.push('email = ?'); values.push(data.email.toLowerCase().trim()); }
        if (data.role !== undefined) { fields.push('role = ?'); values.push(data.role); }
        if (data.store_id !== undefined) { fields.push('store_id = ?'); values.push(data.store_id); }
        if (data.plan !== undefined) { fields.push('plan = ?'); values.push(data.plan); }
        if (data.plan_expires_at !== undefined) { fields.push('plan_expires_at = ?'); values.push(data.plan_expires_at); }
        
        if (fields.length === 0) return this.getById(id);
        
        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);
        
        db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        return this.getById(id);
    }

    /**
     * Cambiar contraseña.
     */
    static async changePassword(id, newPassword) {
        const db = getDb();
        const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(passwordHash, id);
    }

    /**
     * Obtener todos los usuarios (para super-admin).
     */
    static getAll() {
        const db = getDb();
        return db.prepare('SELECT id, email, name, role, store_id, plan, created_at FROM users ORDER BY created_at DESC').all();
    }

    /**
     * Obtener estadísticas de usuarios.
     */
    static getStats() {
        const db = getDb();
        const total = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
        const byPlan = db.prepare('SELECT plan, COUNT(*) as count FROM users GROUP BY plan').all();
        const recent = db.prepare('SELECT COUNT(*) as count FROM users WHERE created_at > datetime("now", "-7 days")').get().count;
        
        return { total, byPlan, recent };
    }
}

module.exports = User;

const { getDb } = require('../config/db');
const bcrypt = require('bcrypt');

class Store {
    static _parseCategories(store) {
        if (store && store.categories) {
            try {
                store.categories_parsed = JSON.parse(store.categories);
            } catch (e) {
                console.warn(`⚠️ [Store Model] Error parseando categorías para la tienda ID ${store.id}:`, e.message);
                store.categories_parsed = [];
            }
        }
        return store;
    }

    static getByPhone(phone) {
        const db = getDb();
        const store = db.prepare('SELECT * FROM stores WHERE phone = ? AND active = 1').get(phone);
        return this._parseCategories(store);
    }

    static getById(id) {
        const db = getDb();
        const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(id);
        return this._parseCategories(store);
    }

    static getAll() {
        const db = getDb();
        const stores = db.prepare('SELECT * FROM stores WHERE active = 1 ORDER BY name').all();
        return stores.map(store => this._parseCategories(store));
    }

    static create({ name, phone, address, adminPassword, botName, businessType, aiPrompt, categories, themeEmoji, welcomeMessage, currency, clinicMode = 0, hostelMode = 0 }) {
        const db = getDb();
        const cats = categories ? JSON.stringify(categories) : '["General"]';
        
        // Si no hay phone, generar uno único para evitar conflicto UNIQUE
        const storePhone = phone || `store_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        
        const passwordHash = adminPassword ? bcrypt.hashSync(adminPassword, 10) : '';

        const result = db.prepare(`
            INSERT INTO stores (name, phone, address, admin_password, bot_name, business_type, ai_prompt, categories, theme_emoji, welcome_message, currency, clinic_mode, hostel_mode)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            name, storePhone, address || '', passwordHash, 
            botName || 'Bot', businessType || 'general', aiPrompt || '', cats,
            themeEmoji || '🏪', welcomeMessage || '', currency || 'USD',
            clinicMode ? 1 : 0, hostelMode ? 1 : 0
        );
        return this.getById(result.lastInsertRowid);
    }

    static update(id, data) {
        const db = getDb();
        const fields = [];
        const values = [];
        
        if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
        if (data.phone !== undefined) { fields.push('phone = ?'); values.push(data.phone); }
        if (data.address !== undefined) { fields.push('address = ?'); values.push(data.address); }
        if (data.botName !== undefined) { fields.push('bot_name = ?'); values.push(data.botName); }
        if (data.businessType !== undefined) { fields.push('business_type = ?'); values.push(data.businessType); }
        if (data.aiPrompt !== undefined) { fields.push('ai_prompt = ?'); values.push(data.aiPrompt); }
        if (data.categories !== undefined) { fields.push('categories = ?'); values.push(JSON.stringify(data.categories)); }
        if (data.themeEmoji !== undefined) { fields.push('theme_emoji = ?'); values.push(data.themeEmoji); }
        if (data.welcomeMessage !== undefined) { fields.push('welcome_message = ?'); values.push(data.welcomeMessage); }
        if (data.currency !== undefined) { fields.push('currency = ?'); values.push(data.currency); }
        if (data.clinic_mode !== undefined) { fields.push('clinic_mode = ?'); values.push(data.clinic_mode); }
        if (data.hostel_mode !== undefined) { fields.push('hostel_mode = ?'); values.push(data.hostel_mode); }
        if (data.notify_phone !== undefined) { fields.push('notify_phone = ?'); values.push(data.notify_phone); }
        if (data.notify_email !== undefined) { fields.push('notify_email = ?'); values.push(data.notify_email); }
        if (data.notification_events !== undefined) { fields.push('notification_events = ?'); values.push(JSON.stringify(data.notification_events)); }
        if (data.working_hours !== undefined) { fields.push('working_hours = ?'); values.push(data.working_hours); }
        if (data.slot_duration !== undefined) { fields.push('slot_duration = ?'); values.push(data.slot_duration); }
        if (data.ownerUserId !== undefined) { fields.push('owner_user_id = ?'); values.push(data.ownerUserId); }
        if (data.plan !== undefined) { fields.push('plan = ?'); values.push(data.plan); }
        if (data.plan_expires_at !== undefined) { fields.push('plan_expires_at = ?'); values.push(data.plan_expires_at); }
        if (data.ai_provider !== undefined) { fields.push('ai_provider = ?'); values.push(data.ai_provider); }
        if (data.ai_model !== undefined) { fields.push('ai_model = ?'); values.push(data.ai_model); }
        if (data.ai_api_key !== undefined) { fields.push('ai_api_key = ?'); values.push(data.ai_api_key); }
        if (data.whatsapp_provider !== undefined) { fields.push('whatsapp_provider = ?'); values.push(data.whatsapp_provider); }
        if (data.whatsapp_status !== undefined) { fields.push('whatsapp_status = ?'); values.push(data.whatsapp_status); }
        
        if (fields.length === 0) return this.getById(id);
        
        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);
        
        db.prepare(`UPDATE stores SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        return this.getById(id);
    }

    /**
     * Eliminar un tenant / store de la base de datos (Exclusivo Superadmin)
     */
    static delete(id) {
        const db = getDb();
        const store = this.getById(id);
        if (!store) return null;

        // Desvincular usuarios asociados asignando store_id = NULL
        db.prepare('UPDATE users SET store_id = NULL WHERE store_id = ?').run(id);

        // Eliminar la tienda (las llaves foráneas ON DELETE CASCADE eliminarán productos, pedidos, citas, etc.)
        const result = db.prepare('DELETE FROM stores WHERE id = ?').run(id);
        return result;
    }
}

module.exports = Store;

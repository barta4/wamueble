const { getDb } = require('../config/db');

class Room {
    /**
     * Crear una habitación / dorm.
     */
    static create({ storeId, name, description, roomType, capacity, pricePerNight, totalUnits }) {
        const db = getDb();
        const result = db.prepare(`
            INSERT INTO rooms (store_id, name, description, room_type, capacity, price_per_night, total_units, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `).run(
            storeId,
            name,
            description || '',
            roomType || 'shared_dorm',
            capacity || 1,
            pricePerNight || 0,
            totalUnits || 1
        );
        return this.getById(result.lastInsertRowid);
    }

    /**
     * Obtener por ID.
     */
    static getById(id) {
        const db = getDb();
        return db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
    }

    /**
     * Obtener todas las habitaciones activas de una tienda.
     */
    static getByStoreId(storeId, onlyActive = true) {
        const db = getDb();
        if (onlyActive) {
            return db.prepare('SELECT * FROM rooms WHERE store_id = ? AND active = 1 ORDER BY name').all(storeId);
        }
        return db.prepare('SELECT * FROM rooms WHERE store_id = ? ORDER BY name').all(storeId);
    }

    /**
     * Actualizar habitación.
     */
    static update(id, data) {
        const db = getDb();
        const fields = [];
        const values = [];

        if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
        if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
        if (data.roomType !== undefined || data.room_type !== undefined) { 
            fields.push('room_type = ?'); values.push(data.roomType || data.room_type); 
        }
        if (data.capacity !== undefined) { fields.push('capacity = ?'); values.push(data.capacity); }
        if (data.pricePerNight !== undefined || data.price_per_night !== undefined) { 
            fields.push('price_per_night = ?'); values.push(data.pricePerNight || data.price_per_night); 
        }
        if (data.totalUnits !== undefined || data.total_units !== undefined) { 
            fields.push('total_units = ?'); values.push(data.totalUnits || data.total_units); 
        }
        if (data.active !== undefined) { fields.push('active = ?'); values.push(data.active); }

        if (fields.length === 0) return this.getById(id);

        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        db.prepare(`UPDATE rooms SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        return this.getById(id);
    }

    /**
     * Desactivar / Eliminar suavemente una habitación.
     */
    static delete(id) {
        const db = getDb();
        db.prepare('UPDATE rooms SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
        return true;
    }

    /**
     * Generar texto descriptivo de las habitaciones disponibles para inyectar en el contexto del Agente IA.
     */
    /**
     * Retorna los tipos predeterminados de habitación.
     */
    static getDefaultRoomTypes() {
        return [
            { id: 'shared_dorm', name: 'Dormitorio Compartido (Camas)' },
            { id: 'private', name: 'Habitación Privada' },
            { id: 'suite', name: 'Suite Especial' },
            { id: 'family', name: 'Habitación Familiar' }
        ];
    }

    /**
     * Obtener tipos de habitación configurados para un tenant/local.
     */
    static getRoomTypes(storeId) {
        const db = getDb();
        const store = db.prepare('SELECT room_types FROM stores WHERE id = ?').get(storeId);
        if (!store || !store.room_types) return this.getDefaultRoomTypes();
        try {
            const types = JSON.parse(store.room_types);
            if (!Array.isArray(types) || types.length === 0) {
                return this.getDefaultRoomTypes();
            }
            return types;
        } catch {
            return this.getDefaultRoomTypes();
        }
    }

    /**
     * Guardar/Actualizar la lista de tipos de habitación de un local.
     */
    static saveRoomTypes(storeId, typesArray) {
        const db = getDb();
        db.prepare('UPDATE stores SET room_types = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(JSON.stringify(typesArray), storeId);
        return this.getRoomTypes(storeId);
    }

    /**
     * Generar texto descriptivo de las habitaciones disponibles para inyectar en el contexto del Agente IA.
     */
    static getCatalogText(storeId) {
        const rooms = this.getByStoreId(storeId, true);
        const typesMap = {};
        this.getRoomTypes(storeId).forEach(t => { typesMap[t.id] = t.name; });

        if (rooms.length === 0) return 'No hay habitaciones registradas en el sistema.';

        let text = 'Opciones de Alojamiento / Habitaciones Disponibles:\n';
        rooms.forEach((r, idx) => {
            const typeLabel = typesMap[r.room_type] || r.room_type || 'Habitación';
            text += `${idx + 1}. **${r.name}** (${typeLabel})\n`;
            if (r.description) text += `   - Descripción: ${r.description}\n`;
            text += `   - Capacidad: hasta ${r.capacity} persona(s)\n`;
            text += `   - Precio por noche: $${r.price_per_night}\n`;
            text += `   - Unidades/Camas totales: ${r.total_units}\n`;
        });

        return text;
    }
}

module.exports = Room;

/**
 * BotState — Singleton para controlar si el bot está activo o apagado.
 * El estado se persiste en la tabla `settings` de SQLite con la clave 'bot_active'.
 * Valor '1' = encendido, '0' = apagado.
 */
const { getDb } = require('../config/db');

const BotState = {
    /**
     * Retorna true si el bot está activo (debe responder mensajes).
     */
    isActive() {
        try {
            const row = getDb().prepare("SELECT value FROM settings WHERE key = 'bot_active'").get();
            return !row || row.value === '1';
        } catch (e) {
            // En caso de error de BD, fallar abierto (bot activo) para no interrumpir el servicio
            console.error('⚠️ BotState: error leyendo estado, asumiendo activo.', e.message);
            return true;
        }
    },

    /**
     * Persiste el estado del bot en la BD.
     * @param {boolean} active - true para encender, false para apagar
     */
    setActive(active) {
        try {
            getDb()
                .prepare("UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'bot_active'")
                .run(active ? '1' : '0');
            console.log(`🤖 Bot ${active ? '✅ encendido' : '🔕 apagado'} manualmente desde el panel.`);
        } catch (e) {
            console.error('❌ BotState: error guardando estado.', e.message);
            throw e;
        }
    }
};

module.exports = BotState;

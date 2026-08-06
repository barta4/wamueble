const { getDb } = require('../config/db');

/**
 * Log de auditoría para acciones del super-admin.
 */
class AuditLog {
    /**
     * Registrar una acción.
     */
    static log({ adminUserId, action, targetType, targetId, details }) {
        const db = getDb();
        db.prepare(`
            INSERT INTO saas_audit_log (admin_user_id, action, target_type, target_id, details)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            adminUserId,
            action,
            targetType || null,
            targetId || null,
            details ? JSON.stringify(details) : null
        );
    }

    /**
     * Obtener logs paginados.
     */
    static getLogs({ page = 1, limit = 50, targetType, targetId } = {}) {
        const db = getDb();
        const offset = (page - 1) * limit;

        let where = 'WHERE 1=1';
        const params = [];

        if (targetType) {
            where += ' AND al.target_type = ?';
            params.push(targetType);
        }
        if (targetId) {
            where += ' AND al.target_id = ?';
            params.push(targetId);
        }

        const logs = db.prepare(`
            SELECT 
                al.*,
                u.name as admin_name,
                u.email as admin_email
            FROM saas_audit_log al
            LEFT JOIN users u ON al.admin_user_id = u.id
            ${where}
            ORDER BY al.created_at DESC
            LIMIT ? OFFSET ?
        `).all(...params, limit, offset);

        const total = db.prepare(`
            SELECT COUNT(*) as count FROM saas_audit_log al ${where}
        `).get(...params).count;

        return {
            logs,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        };
    }

    /**
     * Obtener logs recientes (últimas 24h).
     */
    static getRecentLogs(limit = 20) {
        const db = getDb();
        return db.prepare(`
            SELECT 
                al.*,
                u.name as admin_name,
                u.email as admin_email
            FROM saas_audit_log al
            LEFT JOIN users u ON al.admin_user_id = u.id
            WHERE al.created_at > datetime('now', '-24 hours')
            ORDER BY al.created_at DESC
            LIMIT ?
        `).all(limit);
    }
}

module.exports = AuditLog;

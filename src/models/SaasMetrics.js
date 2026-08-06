const { getDb } = require('../config/db');

/**
 * Métricas agregadas de la plataforma SaaS.
 */
class SaasMetrics {
    /**
     * Obtener métricas generales del dashboard.
     */
    static getDashboard() {
        const db = getDb();

        const totalTenants = db.prepare('SELECT COUNT(*) as count FROM stores WHERE active = 1').get().count;
        const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
        const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
        const ordersThisMonth = db.prepare(`
            SELECT COUNT(*) as count FROM orders 
            WHERE DATE(created_at, 'localtime') >= DATE('now', 'localtime', 'start of month')
        `).get().count;
        const revenueThisMonth = db.prepare(`
            SELECT COALESCE(SUM(total), 0) as total FROM orders 
            WHERE status = 'delivered' AND DATE(updated_at, 'localtime') >= DATE('now', 'localtime', 'start of month')
        `).get().total;

        const activeTenants = db.prepare('SELECT COUNT(*) as count FROM stores WHERE active = 1 AND suspended = 0').get().count;
        const suspendedTenants = db.prepare('SELECT COUNT(*) as count FROM stores WHERE suspended = 1').get().count;

        const tenantsByPlan = db.prepare(`
            SELECT plan, COUNT(*) as count FROM stores WHERE active = 1 GROUP BY plan
        `).all();

        const recentOrders = db.prepare(`
            SELECT COUNT(*) as count FROM orders 
            WHERE created_at > datetime('now', '-7 days')
        `).get().count;

        const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
        const totalCustomers = db.prepare('SELECT COUNT(*) as count FROM customers').get().count;

        return {
            totalTenants,
            totalUsers,
            totalOrders,
            ordersThisMonth,
            revenueThisMonth,
            activeTenants,
            suspendedTenants,
            tenantsByPlan,
            recentOrders,
            totalProducts,
            totalCustomers
        };
    }

    /**
     * Obtener lista de tenants con info resumida.
     */
    static getTenants() {
        const db = getDb();
        return db.prepare(`
            SELECT 
                s.*,
                u.email as owner_email,
                u.name as owner_name,
                (SELECT COUNT(*) FROM orders WHERE store_id = s.id) as total_orders,
                (SELECT COUNT(*) FROM products WHERE store_id = s.id) as total_products,
                (SELECT COUNT(*) FROM customers WHERE store_id = s.id) as total_customers,
                (SELECT COUNT(*) FROM delivery_drivers WHERE store_id = s.id AND active = 1) as total_drivers
            FROM stores s
            LEFT JOIN users u ON s.owner_user_id = u.id
            ORDER BY s.created_at DESC
        `).all();
    }

    /**
     * Obtener detalle de un tenant.
     */
    static getTenantById(id) {
        const db = getDb();
        const store = db.prepare(`
            SELECT s.*, u.email as owner_email, u.name as owner_name, u.id as owner_id
            FROM stores s
            LEFT JOIN users u ON s.owner_user_id = u.id
            WHERE s.id = ?
        `).get(id);

        if (!store) return null;

        // Estadísticas del tenant
        store.stats = {
            totalOrders: db.prepare('SELECT COUNT(*) as count FROM orders WHERE store_id = ?').get(id).count,
            ordersThisMonth: db.prepare(`
                SELECT COUNT(*) as count FROM orders WHERE store_id = ? 
                AND DATE(created_at, 'localtime') >= DATE('now', 'localtime', 'start of month')
            `).get(id).count,
            totalProducts: db.prepare('SELECT COUNT(*) as count FROM products WHERE store_id = ?').get(id).count,
            totalCustomers: db.prepare('SELECT COUNT(*) as count FROM customers WHERE store_id = ?').get(id).count,
            totalRevenue: db.prepare(`
                SELECT COALESCE(SUM(total), 0) as total FROM orders 
                WHERE store_id = ? AND status = 'delivered'
            `).get(id).total,
            activeConversations: db.prepare(`
                SELECT COUNT(*) as count FROM conversations 
                WHERE store_id = ? AND status = 'active'
            `).get(id).count
        };

        // Conexión BD externa
        store.dbConnection = db.prepare(`
            SELECT * FROM db_connections WHERE store_id = ? AND active = 1 LIMIT 1
        `).get(id) || null;

        return store;
    }

    /**
     * Obtener estado de agentes IA por tenant.
     */
    static getAiStatus() {
        const db = getDb();
        return db.prepare(`
            SELECT 
                s.id,
                s.name,
                s.ai_provider,
                s.ai_model,
                CASE WHEN s.ai_api_key != '' THEN 1 ELSE 0 END as has_api_key,
                s.bot_name,
                s.business_type,
                (SELECT COUNT(*) FROM conversations WHERE store_id = s.id AND status = 'active') as active_conversations,
                (SELECT COUNT(*) FROM orders WHERE store_id = s.id AND DATE(created_at) = DATE('now')) as orders_today
            FROM stores s
            WHERE s.active = 1
            ORDER BY s.name
        `).all();
    }

    /**
     * Obtener estado de WhatsApp por tenant.
     */
    static getWhatsAppStatus() {
        const db = getDb();
        return db.prepare(`
            SELECT 
                s.id,
                s.name,
                s.phone,
                s.whatsapp_provider,
                s.whatsapp_status,
                s.bot_name,
                (SELECT value FROM settings WHERE key = 'whatsapp_mode') as global_whatsapp_mode
            FROM stores s
            WHERE s.active = 1
            ORDER BY s.name
        `).all();
    }

    /**
     * Obtener estado de conexiones BD externas por tenant.
     */
    static getDbConnections() {
        const db = getDb();
        return db.prepare(`
            SELECT 
                dc.*,
                s.name as store_name,
                s.phone as store_phone
            FROM db_connections dc
            JOIN stores s ON dc.store_id = s.id
            WHERE dc.active = 1
            ORDER BY s.name
        `).all();
    }
}

module.exports = SaasMetrics;

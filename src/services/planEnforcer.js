/**
 * Servicio de Verificación de Límites por Plan.
 * Verifica si un tenant puede realizar una acción según su plan actual.
 */

const { getDb } = require('../config/db');
const { getPlan } = require('../config/plans');

class PlanEnforcer {
    /**
     * Obtener el plan actual de un store.
     */
    static getStorePlan(storeId) {
        const db = getDb();
        const store = db.prepare('SELECT plan FROM stores WHERE id = ?').get(storeId);
        return getPlan(store ? store.plan : 'free');
    }

    /**
     * Verificar si se puede crear un pedido.
     */
    static canCreateOrder(storeId) {
        const plan = this.getStorePlan(storeId);
        
        // Plan ilimitado
        if (plan.limits.ordersPerMonth === -1) {
            return { allowed: true, remaining: -1 };
        }

        const db = getDb();
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const count = db.prepare(`
            SELECT COUNT(*) as count FROM orders 
            WHERE store_id = ? AND created_at >= ?
        `).get(storeId, startOfMonth.toISOString()).count;

        const remaining = plan.limits.ordersPerMonth - count;

        return {
            allowed: remaining > 0,
            used: count,
            limit: plan.limits.ordersPerMonth,
            remaining: Math.max(0, remaining)
        };
    }

    /**
     * Verificar si se puede agregar un producto.
     */
    static canAddProduct(storeId) {
        const plan = this.getStorePlan(storeId);
        
        if (plan.limits.products === -1) {
            return { allowed: true, remaining: -1 };
        }

        const db = getDb();
        const count = db.prepare(`
            SELECT COUNT(*) as count FROM products WHERE store_id = ?
        `).get(storeId).count;

        const remaining = plan.limits.products - count;

        return {
            allowed: remaining > 0,
            used: count,
            limit: plan.limits.products,
            remaining: Math.max(0, remaining)
        };
    }

    /**
     * Verificar si se puede agregar un repartidor.
     */
    static canAddDriver(storeId) {
        const plan = this.getStorePlan(storeId);
        
        if (plan.limits.drivers === -1) {
            return { allowed: true, remaining: -1 };
        }

        const db = getDb();
        const count = db.prepare(`
            SELECT COUNT(*) as count FROM delivery_drivers WHERE store_id = ?
        `).get(storeId).count;

        const remaining = plan.limits.drivers - count;

        return {
            allowed: remaining > 0,
            used: count,
            limit: plan.limits.drivers,
            remaining: Math.max(0, remaining)
        };
    }

    /**
     * Verificar si se puede usar una BD externa.
     */
    static canUseDbConnection(storeId) {
        const plan = this.getStorePlan(storeId);
        return {
            allowed: plan.limits.dbConnections,
            feature: 'Conexión a BD externa'
        };
    }

    /**
     * Verificar si se puede usar multi-sucursal.
     */
    static canUseMultiStore(storeId) {
        const plan = this.getStorePlan(storeId);
        return {
            allowed: plan.limits.multiStore,
            feature: 'Multi-sucursal'
        };
    }

    /**
     * Verificar si se puede usar API access.
     */
    static canUseApiAccess(storeId) {
        const plan = this.getStorePlan(storeId);
        return {
            allowed: plan.limits.apiAccess,
            feature: 'API Access'
        };
    }

    /**
     * Obtener uso actual de todos los límites.
     */
    static getUsage(storeId) {
        const db = getDb();
        const plan = this.getStorePlan(storeId);

        // Pedidos este mes
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const ordersThisMonth = db.prepare(`
            SELECT COUNT(*) as count FROM orders 
            WHERE store_id = ? AND created_at >= ?
        `).get(storeId, startOfMonth.toISOString()).count;

        // Productos
        const products = db.prepare(`
            SELECT COUNT(*) as count FROM products WHERE store_id = ?
        `).get(storeId).count;

        // Repartidores
        const drivers = db.prepare(`
            SELECT COUNT(*) as count FROM delivery_drivers WHERE store_id = ?
        `).get(storeId).count;

        return {
            plan: plan.id,
            planName: plan.name,
            usage: {
                orders: {
                    used: ordersThisMonth,
                    limit: plan.limits.ordersPerMonth,
                    unlimited: plan.limits.ordersPerMonth === -1
                },
                products: {
                    used: products,
                    limit: plan.limits.products,
                    unlimited: plan.limits.products === -1
                },
                drivers: {
                    used: drivers,
                    limit: plan.limits.drivers,
                    unlimited: plan.limits.drivers === -1
                }
            },
            features: {
                dbConnections: plan.limits.dbConnections,
                multiStore: plan.limits.multiStore,
                apiAccess: plan.limits.apiAccess,
                customBranding: plan.limits.customBranding,
                prioritySupport: plan.limits.prioritySupport
            }
        };
    }

    /**
     * Middleware Express: Verificar límites antes de crear recursos.
     */
    static checkLimit(resourceType) {
        return (req, res, next) => {
            if (!req.user || !req.user.store_id) {
                return next();
            }

            const storeId = req.user.store_id;
            let check;

            switch (resourceType) {
                case 'order':
                    check = this.canCreateOrder(storeId);
                    break;
                case 'product':
                    check = this.canAddProduct(storeId);
                    break;
                case 'driver':
                    check = this.canAddDriver(storeId);
                    break;
                default:
                    return next();
            }

            if (!check.allowed) {
                return res.status(403).json({
                    error: 'Límite de tu plan alcanzado',
                    limit: check.limit,
                    used: check.used,
                    upgrade: true,
                    message: `Has alcanzado el límite de ${check.limit} ${resourceType}s de tu plan ${this.getStorePlan(storeId).name}. Actualiza tu plan para continuar.`
                });
            }

            // Agregar info de límites a la request
            req.planLimits = check;
            next();
        };
    }
}

module.exports = PlanEnforcer;

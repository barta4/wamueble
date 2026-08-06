const { getDb } = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const Customer = require('./Customer');

class Order {
    /**
     * Crear un nuevo pedido con sus items.
     */
    static create({ storeId, customerPhone, customerName, address, paymentMethod, items, notes, mediaUrls = null }) {
        const db = getDb();

        const orderNumber = this._generateOrderNumber(storeId);
        const total = items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);

        const insertOrder = db.prepare(`
            INSERT INTO orders (store_id, order_number, customer_phone, customer_name, address, payment_method, total, notes, media_urls)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertItem = db.prepare(`
            INSERT INTO order_items (order_id, product_name, quantity, unit_price, details)
            VALUES (?, ?, ?, ?, ?)
        `);

        // Transacción para insertar pedido + items atómicamente
        const createOrder = db.transaction(() => {
            const result = insertOrder.run(
                storeId, orderNumber, customerPhone, customerName || '',
                address, paymentMethod || '', total, notes || '', mediaUrls
            );
            const orderId = result.lastInsertRowid;

            for (const item of items) {
                insertItem.run(orderId, item.product_name, item.quantity, item.unit_price, item.details || '');
            }

            return orderId;
        });

        const orderId = createOrder();
        
        // Registrar/Actualizar cliente
        Customer.getOrCreate(storeId, customerPhone, customerName || null);
        
        return this.getById(orderId);
    }

    /**
     * Obtener pedido por ID con sus items.
     */
    static getById(id) {
        const db = getDb();
        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
        if (!order) return null;

        order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
        return order;
    }

    /**
     * Obtener pedidos pendientes de un local.
     */
    static getPending(storeId) {
        const db = getDb();
        const orders = db.prepare(`
            SELECT * FROM orders 
            WHERE store_id = ? AND status = 'pending'
            ORDER BY created_at ASC
        `).all(storeId);

        // Adjuntar items a cada pedido
        const getItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
        for (const order of orders) {
            order.items = getItems.all(order.id);
        }

        return orders;
    }

    /**
     * Marcar pedido como listo y asignar repartidor.
     */
    static markReady(id, driverId = null, storeId = null) {
        const db = getDb();
        if (storeId) {
            db.prepare(`
                UPDATE orders 
                SET status = 'ready', ready_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, driver_id = ?
                WHERE id = ? AND store_id = ?
            `).run(driverId, id, storeId);
        } else {
            db.prepare(`
                UPDATE orders 
                SET status = 'ready', ready_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, driver_id = ?
                WHERE id = ?
            `).run(driverId, id);
        }
        return this.getById(id);
    }

    /**
     * Cancelar pedido.
     */
    static cancel(id, storeId = null) {
        const db = getDb();
        if (storeId) {
            db.prepare(`
                UPDATE orders 
                SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND store_id = ?
            `).run(id, storeId);
        } else {
            db.prepare(`
                UPDATE orders 
                SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(id);
        }
        return this.getById(id);
    }

    /**
     * Obtener historial de pedidos de un local.
     */
    static getHistory(storeId, limit = 50) {
        const db = getDb();
        const orders = db.prepare(`
            SELECT * FROM orders 
            WHERE store_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        `).all(storeId, limit);

        const getItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
        for (const order of orders) {
            order.items = getItems.all(order.id);
        }

        return orders;
    }

    /**
     * Obtener pedidos en camino (status = 'ready').
     */
    static getReady(storeId) {
        const db = getDb();
        const orders = db.prepare(`
            SELECT * FROM orders 
            WHERE store_id = ? AND status = 'ready'
            ORDER BY ready_at ASC
        `).all(storeId);

        const getItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
        for (const order of orders) {
            order.items = getItems.all(order.id);
        }

        return orders;
    }

    /**
     * Marcar pedido como entregado.
     */
    static markDelivered(id, storeId = null) {
        const db = getDb();
        const order = storeId 
            ? db.prepare('SELECT store_id, customer_phone, total FROM orders WHERE id = ? AND store_id = ?').get(id, storeId)
            : db.prepare('SELECT store_id, customer_phone, total FROM orders WHERE id = ?').get(id);
        
        if (storeId) {
            db.prepare(`
                UPDATE orders 
                SET status = 'delivered', updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND store_id = ?
            `).run(id, storeId);
        } else {
            db.prepare(`
                UPDATE orders 
                SET status = 'delivered', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(id);
        }
        
        if (order) {
            Customer.updateStats(order.store_id, order.customer_phone, order.total);
        }
        
        return this.getById(id);
    }

    /**
     * Obtener historial de compras formateado para la IA y notas del operador.
     */
    static getCustomerHistoryText(storeId, phone) {
        const db = getDb();
        
        // Obtener datos del cliente
        const customer = db.prepare('SELECT name, bot_notes FROM customers WHERE store_id = ? AND phone = ?').get(storeId, phone);
        let profileText = '';
        if (customer && customer.bot_notes) {
            profileText = `[NOTAS INTERNAS SOBRE EL CLIENTE (MÁXIMA PRIORIDAD): ${customer.bot_notes}]\n`;
        }
        if (customer && customer.name) {
            profileText += `Nombre del cliente: ${customer.name}\n`;
        }

        const orders = db.prepare(`
            SELECT id, order_number, created_at FROM orders
            WHERE store_id = ? AND customer_phone = ? AND status = 'delivered'
            ORDER BY created_at DESC
            LIMIT 3
        `).all(storeId, phone);

        if (orders.length === 0) {
            return profileText + 'Historial de compras: Este es un cliente nuevo, no tiene compras anteriores registradas.';
        }

        let text = profileText + 'Historial de compras recientes del cliente:\n';
        const getItems = db.prepare('SELECT product_name, quantity, details FROM order_items WHERE order_id = ?');
        
        orders.forEach(order => {
            const date = new Date(order.created_at).toLocaleDateString('es-UY');
            const items = getItems.all(order.id);
            const itemsStr = items.map(i => {
                let itemStr = `${i.quantity}x ${i.product_name}`;
                if (i.details) itemStr += ` (${i.details})`;
                return itemStr;
            }).join(', ');

            text += `- Pedido N° ${order.order_number} (${date}): ${itemsStr}\n`;
        });

        return text;
    }

    /**
     * Obtener reporte diario de ventas y repartos para hoy (hora local).
     */
    static getDailyReport(storeId) {
        const db = getDb();
        const today = new Date().toLocaleDateString('es-UY');
        
        // Totales de pedidos entregados y facturación de hoy
        const summary = db.prepare(`
            SELECT 
                COUNT(*) as total_orders,
                COALESCE(SUM(total), 0) as total_revenue
            FROM orders
            WHERE store_id = ? AND status = 'delivered' AND DATE(updated_at, 'localtime') = DATE('now', 'localtime')
        `).get(storeId);

        // Pedidos por método de pago de hoy
        const paymentMethods = db.prepare(`
            SELECT 
                payment_method,
                COUNT(*) as count,
                COALESCE(SUM(total), 0) as total
            FROM orders
            WHERE store_id = ? AND status = 'delivered' AND DATE(updated_at, 'localtime') = DATE('now', 'localtime')
            GROUP BY payment_method
        `).all(storeId);

        // Repartos por conductor de hoy
        const driverDeliveries = db.prepare(`
            SELECT 
                d.name as driver_name,
                COUNT(o.id) as count,
                COALESCE(SUM(o.total), 0) as total
            FROM orders o
            JOIN delivery_drivers d ON o.driver_id = d.id
            WHERE o.store_id = ? AND o.status = 'delivered' AND DATE(o.updated_at, 'localtime') = DATE('now', 'localtime')
            GROUP BY o.driver_id
        `).all(storeId);

        return {
            date: today,
            totalOrders: summary.total_orders,
            totalRevenue: summary.total_revenue,
            paymentMethods,
            driverDeliveries
        };
    }
    static _generateOrderNumber(storeId = null) {
        const db = getDb();
        const today = new Date().toISOString().split('T')[0];
        const result = storeId ? db.prepare(`
            SELECT MAX(CAST(order_number AS INTEGER)) as max_num FROM orders 
            WHERE store_id = ? AND DATE(created_at) = ?
        `).get(storeId, today) : db.prepare(`
            SELECT MAX(CAST(order_number AS INTEGER)) as max_num FROM orders 
            WHERE DATE(created_at) = ?
        `).get(today);
        return String(((result ? result.max_num : 0) || 0) + 1).padStart(4, '0');
    }
}

module.exports = Order;

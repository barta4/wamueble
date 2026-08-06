const { getDb } = require('../config/db');

class ReportService {
    /**
     * Generar informe financiero y operativo consolidado por tienda
     */
    static getSummary(storeId) {
        const db = getDb();

        // 1. Métricas de Ventas/Pedidos
        const salesMetrics = db.prepare(`
            SELECT 
                COUNT(*) as total_orders,
                COALESCE(SUM(total), 0) as total_revenue,
                COALESCE(AVG(total), 0) as avg_ticket
            FROM orders
            WHERE store_id = ? AND status != 'cancelled'
        `).get(storeId);

        // 2. Métricas de Citas Médicas
        const appointmentMetrics = db.prepare(`
            SELECT 
                COUNT(*) as total_appointments,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN total ELSE 0 END), 0) as clinic_revenue
            FROM appointments
            WHERE store_id = ?
        `).get(storeId);

        // 3. Métricas de Hostel (Reservas y Ocupación)
        const bookingMetrics = db.prepare(`
            SELECT 
                COUNT(*) as total_bookings,
                COALESCE(SUM(total_price), 0) as hostel_revenue
            FROM bookings
            WHERE store_id = ? AND status != 'cancelled'
        `).get(storeId);

        // 4. Clientes Totales en CRM
        const customerCount = db.prepare(`
            SELECT COUNT(*) as count FROM customers WHERE store_id = ?
        `).get(storeId).count;

        // 5. Productos / Servicios más vendidos
        const topItems = db.prepare(`
            SELECT product_name, SUM(quantity) as quantity_sold, SUM(quantity * unit_price) as total_generated
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE o.store_id = ? AND o.status != 'cancelled'
            GROUP BY product_name
            ORDER BY quantity_sold DESC
            LIMIT 5
        `).all(storeId);

        return {
            storeId,
            sales: {
                totalOrders: salesMetrics.total_orders,
                totalRevenue: salesMetrics.total_revenue,
                avgTicket: salesMetrics.avg_ticket
            },
            clinic: {
                totalAppointments: appointmentMetrics.total_appointments,
                clinicRevenue: appointmentMetrics.clinic_revenue
            },
            hostel: {
                totalBookings: bookingMetrics.total_bookings,
                hostelRevenue: bookingMetrics.hostel_revenue
            },
            customers: {
                totalCustomers: customerCount
            },
            topItems
        };
    }

    /**
     * Exportar informe resumido en formato CSV / Excel
     */
    static exportToCsv(storeId) {
        const summary = this.getSummary(storeId);
        
        let csv = `REPORTE CONSOLIDADO URUBOT SAAS\n`;
        csv += `Fecha de Generacion,${new Date().toLocaleString('es-UY')}\n\n`;
        csv += `METRICAS GENERALES\n`;
        csv += `Total Pedidos,${summary.sales.totalOrders}\n`;
        csv += `Ingresos Pedidos,$${summary.sales.totalRevenue.toFixed(2)}\n`;
        csv += `Ticket Promedio,$${summary.sales.avgTicket.toFixed(2)}\n`;
        csv += `Total Citas,${summary.clinic.totalAppointments}\n`;
        csv += `Ingresos Citas,$${summary.clinic.clinicRevenue.toFixed(2)}\n`;
        csv += `Total Reservas Hostel,${summary.hostel.totalBookings}\n`;
        csv += `Ingresos Hostel,$${summary.hostel.hostelRevenue.toFixed(2)}\n`;
        csv += `Clientes Totales CRM,${summary.customers.totalCustomers}\n\n`;

        csv += `TOP PRODUCTOS / SERVICIOS MAS VENDIDOS\n`;
        csv += `Producto,Cantidad Vendida,Total Generado\n`;
        summary.topItems.forEach(item => {
            csv += `"${item.product_name}",${item.quantity_sold},$${item.total_generated.toFixed(2)}\n`;
        });

        return csv;
    }
}

module.exports = ReportService;

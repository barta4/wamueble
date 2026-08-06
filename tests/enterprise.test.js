const { getDb } = require('../src/config/db');
const Store = require('../src/models/Store');
const Campaign = require('../src/models/Campaign');
const PaymentService = require('../src/services/PaymentService');
const ReportService = require('../src/services/ReportService');
const Order = require('../src/models/Order');

describe('Suite Completa de Funcionalidades Enterprise UruBot', () => {
    let store;

    beforeAll(() => {
        getDb();
        store = Store.create({
            name: 'UruBot Enterprise Store Test',
            phone: '+59899000999',
            businessType: 'general'
        });
    });

    test('1. Motor de Campañas Oficiales Meta Cloud API', () => {
        const campaign = Campaign.create({
            storeId: store.id,
            name: 'Promoción Verano 2026',
            templateName: 'promo_descuento_v1',
            languageCode: 'es',
            parametersMapping: ['customer_name', 'store_name']
        });

        expect(campaign.id).toBeDefined();
        expect(campaign.template_name).toBe('promo_descuento_v1');

        const campaigns = Campaign.getByStoreId(store.id);
        expect(campaigns.length).toBeGreaterThan(0);
    });

    test('2. Pasarela de Pagos (Mercado Pago / Stripe)', async () => {
        const order = Order.create({
            storeId: store.id,
            customerPhone: '+59899111222',
            customerName: 'Cliente Pago',
            address: 'Av. 18 de Julio 1234',
            items: [{ id: 1, product_name: 'Producto Test', unit_price: 100, quantity: 1 }],
            total: 100
        });

        const preference = await PaymentService.createMercadoPagoPreference({
            title: `Pedido #${order.order_number}`,
            price: 100,
            externalReference: order.id,
            storeId: store.id
        });

        expect(preference.paymentUrl).toBeDefined();

        // Simulación de notificación de pago vía Webhook IPN
        const result = await PaymentService.processPaymentNotification(order.id, 'paid');
        expect(result).not.toBeNull();
        expect(result.type).toBe('order');
    });

    test('3. Módulo de Reportes Financieros y CSV', () => {
        const summary = ReportService.getSummary(store.id);
        expect(summary.storeId).toBe(store.id);
        expect(summary.sales).toBeDefined();

        const csv = ReportService.exportToCsv(store.id);
        expect(csv).toContain('REPORTE CONSOLIDADO URUBOT SAAS');
        expect(csv).toContain('METRICAS GENERALES');
    });
});

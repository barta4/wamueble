jest.mock('../src/services/whatsapp', () => ({
    sendTextMessage: jest.fn().mockResolvedValue({ success: true })
}));

const { runMigrations, getDb } = require('../src/config/db');
const Store = require('../src/models/Store');
const Booking = require('../src/models/Booking');
const Room = require('../src/models/Room');
const Appointment = require('../src/models/Appointment');
const Order = require('../src/models/Order');
const FollowUpService = require('../src/services/FollowUpService');

describe('Motor de Automatización y Seguimiento Post-Atención por Negocio', () => {
    beforeAll(() => {
        getDb();
    });

    test('Modo Hostel: Generación de Pre-Checkin 24h antes', async () => {
        const store = Store.create({
            name: 'Hostel Alojamiento Test',
            phone: '+59899000111',
            businessType: 'hostel',
            hostelMode: 1
        });

        const room = Room.create({
            storeId: store.id,
            name: 'Dormitorio 4 Camas',
            pricePerNight: 25,
            capacity: 4,
            totalUnits: 1
        });

        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const booking = Booking.create({
            storeId: store.id,
            roomId: room.id,
            customerPhone: '+59899999888',
            customerName: 'Lucas Huésped',
            checkInDate: tomorrow,
            checkOutDate: inThreeDays,
            guestsCount: 1,
            totalPrice: 50
        });

        expect(booking.id).toBeDefined();

        // Ejecutar seguimiento
        await FollowUpService.processHostelAutomations(store);

        // Verificar que se registró en follow_up_logs
        const isSent = await FollowUpService.isLogSent(store.id, 'pre_checkin', booking.id);
        expect(isSent).toBe(true);
    });

    test('Modo Clínica: Recordatorio de cita 24h antes', async () => {
        const store = Store.create({
            name: 'Clínica Salud Test',
            phone: '+59899000222',
            businessType: 'clinic',
            clinicMode: 1
        });

        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const appointment = Appointment.create({
            storeId: store.id,
            customerPhone: '+59899777666',
            customerName: 'María Paciente',
            service: { name: 'Consulta Odontológica', price: 50 },
            doctor: 'Dr. Pérez',
            date: tomorrow,
            time: '15:00'
        });

        expect(appointment.id).toBeDefined();

        // Ejecutar seguimiento
        await FollowUpService.processClinicAutomations(store);

        // Verificar que se registró en follow_up_logs
        const isSent = await FollowUpService.isLogSent(store.id, 'appointment_reminder', appointment.id);
        expect(isSent).toBe(true);
    });

    test('Modo Tienda: Encuesta Post-Entrega de pedido', async () => {
        const store = Store.create({
            name: 'Pizzería Test',
            phone: '+59899000333',
            businessType: 'pizzeria'
        });

        const order = Order.create({
            storeId: store.id,
            customerPhone: '+59899555444',
            customerName: 'Carlos Cliente',
            address: 'Av. 18 de Julio 1234',
            items: [{ id: 1, product_name: 'Pizza Muzzarella', unit_price: 15, quantity: 1 }],
            total: 15
        });

        Order.markDelivered(order.id, store.id);

        // Ejecutar seguimiento
        await FollowUpService.processStoreAutomations(store);

        // Verificar que se registró en follow_up_logs
        const isSent = await FollowUpService.isLogSent(store.id, 'order_feedback', order.id);
        expect(isSent).toBe(true);
    });
});

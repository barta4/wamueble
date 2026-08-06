const { getDb } = require('../src/config/db');
const Store = require('../src/models/Store');
const Product = require('../src/models/Product');
const Order = require('../src/models/Order');
const Appointment = require('../src/models/Appointment');
const Room = require('../src/models/Room');
const Booking = require('../src/models/Booking');
const Customer = require('../src/models/Customer');

describe('Auditoría Completa del Sistema - Modelos y Flujos', () => {
    let storeId;

    beforeAll(() => {
        getDb();
        const store = Store.create({
            name: 'Audit Store',
            phone: '59898888888',
            address: 'Av. Test 456',
            businessType: 'general'
        });
        storeId = store.id;
    });

    test('Store CRUD y alternancia de modos (Clínica y Hostel)', () => {
        const store = Store.getById(storeId);
        expect(store).toBeDefined();

        const updatedClinic = Store.update(storeId, { clinic_mode: 1 });
        expect(updatedClinic.clinic_mode).toBe(1);

        const updatedHostel = Store.update(storeId, { hostel_mode: 1 });
        expect(updatedHostel.hostel_mode).toBe(1);
    });

    test('Creación de productos y catálogo', () => {
        const p1 = Product.create({
            storeId,
            name: 'Pizza Muzzarella',
            price: 350,
            category: 'Pizzas'
        });
        expect(p1.id).toBeGreaterThan(0);

        const catalog = Product.getCatalogText(storeId);
        expect(catalog).toContain('Pizza Muzzarella');
    });

    test('Creación de pedido y CRM de cliente', () => {
        const order = Order.create({
            storeId,
            customerPhone: '+59899111222',
            customerName: 'Maria Perez',
            address: 'Calle 18 de Julio 1000',
            paymentMethod: 'Efectivo',
            items: [{ product_name: 'Pizza Muzzarella', quantity: 2, unit_price: 350 }]
        });

        expect(order.order_number).toBeDefined();
        expect(order.total).toBe(700);

        const customer = Customer.getByPhone(storeId, '+59899111222');
        expect(customer).toBeDefined();
        expect(customer.name).toBe('Maria Perez');
    });

    test('Creación de citas y slots de disponibilidad', () => {
        const service = { name: 'Consulta Médica General', price: 50 };
        const apt = Appointment.create({
            storeId,
            customerPhone: '+59899333444',
            customerName: 'Carlos Gomez',
            service,
            date: '2026-03-01',
            time: '10:00',
            duration: 30
        });

        expect(apt.appointment_number).toMatch(/^CIT-/);
        expect(apt.status).toBe('pending');
    });

    test('Creación de habitación y reserva de hostel', () => {
        const room = Room.create({
            storeId,
            name: 'Habitación Privada Matrimonial',
            roomType: 'private',
            pricePerNight: 50,
            capacity: 2,
            totalUnits: 2
        });

        const booking = Booking.create({
            storeId,
            customerPhone: '+59899555666',
            customerName: 'Laura Sanchez',
            roomId: room.id,
            roomName: room.name,
            checkInDate: '2026-04-01',
            checkOutDate: '2026-04-05',
            guestsCount: 2,
            totalPrice: 200,
            paymentMethod: 'Transferencia'
        });

        expect(booking.booking_number).toMatch(/^HST-/);
        expect(Booking.calculateNights('2026-04-01', '2026-04-05')).toBe(4);
    });
});

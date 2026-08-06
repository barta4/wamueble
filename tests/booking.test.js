const { getDb } = require('../src/config/db');
const Room = require('../src/models/Room');
const Booking = require('../src/models/Booking');
const Store = require('../src/models/Store');

describe('Modo Hostel - Room & Booking Tests', () => {
    let storeId;

    beforeAll(() => {
        getDb();
        const store = Store.create({
            name: 'Hostel Test',
            phone: '59899999999',
            address: 'Calle Falsa 123',
            businessType: 'hostel'
        });
        storeId = store.id;
    });

    test('Cálculo de noches de estadía', () => {
        const nights = Booking.calculateNights('2026-02-10', '2026-02-14');
        expect(nights).toBe(4);
    });

    test('Creación y consulta de disponibilidad de habitaciones', () => {
        const room = Room.create({
            storeId,
            name: 'Dormitorio 6 Camas Mixto',
            roomType: 'shared_dorm',
            pricePerNight: 20,
            capacity: 6,
            totalUnits: 6
        });

        expect(room).toBeDefined();
        expect(room.id).toBeGreaterThan(0);

        const available = Booking.getAvailableRoomsForDates(storeId, '2026-02-10', '2026-02-14', 2);
        expect(available.length).toBeGreaterThan(0);
        expect(available[0].is_available).toBe(true);
        expect(available[0].total_price).toBe(80); // 4 noches x $20
    });

    test('Creación de reserva y actualización de cupo', () => {
        const rooms = Room.getByStoreId(storeId);
        const roomId = rooms[0].id;

        const booking = Booking.create({
            storeId,
            customerPhone: '+59891111111',
            customerName: 'Viajero Juan',
            roomId,
            roomName: rooms[0].name,
            checkInDate: '2026-02-10',
            checkOutDate: '2026-02-14',
            guestsCount: 2,
            totalPrice: 80,
            paymentMethod: 'Efectivo'
        });

        expect(booking).toBeDefined();
        expect(booking.booking_number).toMatch(/^HST-/);
        expect(booking.status).toBe('pending');

        const availableAfterBooking = Booking.getAvailableRoomsForDates(storeId, '2026-02-10', '2026-02-14', 1);
        expect(availableAfterBooking[0].available_units).toBe(5); // 6 - 1 reserva
    });
});

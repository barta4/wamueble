const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const { requireAuth } = require('../middleware/auth');

// GET /api/appointments - Obtener citas del store
router.get('/', requireAuth, (req, res) => {
    try {
        const { status, date, history } = req.query;
        const storeId = req.user.store_id;

        let appointments;
        if (history === 'true') {
            appointments = Appointment.getHistory(storeId);
        } else if (date) {
            appointments = Appointment.getHistory(storeId).filter(a => a.date === date);
        } else if (status) {
            const db = require('../config/db').getDb();
            appointments = db.prepare(`
                SELECT * FROM appointments 
                WHERE store_id = ? AND status = ?
                ORDER BY date ASC, time ASC
            `).all(storeId, status);
        } else {
            appointments = Appointment.getToday(storeId);
        }

        res.json({ success: true, appointments });
    } catch (error) {
        console.error('Error getting appointments:', error);
        res.status(500).json({ success: false, error: 'Error al obtener citas' });
    }
});

// GET /api/appointments/calendar - Obtener citas en formato FullCalendar
router.get('/calendar', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const appointments = Appointment.getHistory(storeId);
        
        const events = appointments.map(apt => {
            const startTime = `${apt.date}T${apt.time}`;
            
            const startObj = new Date(startTime);
            startObj.setMinutes(startObj.getMinutes() + (apt.duration || 30));
            // Asegurar formato local correcto YYYY-MM-DDTHH:mm
            const tzOffset = (new Date()).getTimezoneOffset() * 60000;
            const endObjLocal = new Date(startObj - tzOffset);
            const endTime = endObjLocal.toISOString().slice(0, 16);

            let color = '#3788d8';
            if (apt.status === 'confirmed') color = '#28a745';
            if (apt.status === 'completed') color = '#6c757d';

            return {
                id: apt.id,
                title: `${apt.customer_name || 'Sin Nombre'} - ${apt.service}`,
                start: startTime,
                end: endTime,
                backgroundColor: color,
                extendedProps: {
                    phone: apt.customer_phone,
                    doctor: apt.doctor,
                    status: apt.status,
                    notes: apt.notes
                }
            };
        });

        res.json(events);
    } catch (error) {
        console.error('Error getting calendar events:', error);
        res.status(500).json({ success: false, error: 'Error al obtener calendario' });
    }
});

// GET /api/appointments/available-slots - Obtener horarios disponibles
router.get('/available-slots', requireAuth, (req, res) => {
    try {
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({ success: false, error: 'Fecha requerida' });
        }

        const slots = Appointment.getAvailableSlots(req.user.store_id, date);
        res.json({ success: true, slots });
    } catch (error) {
        console.error('Error getting available slots:', error);
        res.status(500).json({ success: false, error: 'Error al obtener horarios' });
    }
});

// GET /api/appointments/services - Obtener servicios del store
router.get('/services', requireAuth, (req, res) => {
    try {
        const services = Appointment.getServices(req.user.store_id);
        res.json({ success: true, services });
    } catch (error) {
        console.error('Error getting services:', error);
        res.status(500).json({ success: false, error: 'Error al obtener servicios' });
    }
});

// GET /api/appointments/doctors - Obtener doctores del store
router.get('/doctors', requireAuth, (req, res) => {
    try {
        const Doctor = require('../models/Doctor');
        const doctors = Doctor.getByStoreId(req.user.store_id, false); // Obtener todos, incluso inactivos
        res.json({ success: true, doctors });
    } catch (error) {
        console.error('Error getting doctors:', error);
        res.status(500).json({ success: false, error: 'Error al obtener doctores' });
    }
});

// POST /api/appointments/doctors - Crear doctor
router.post('/doctors', requireAuth, (req, res) => {
    try {
        const { name, specialty } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'Nombre es requerido' });
        
        const Doctor = require('../models/Doctor');
        const doctor = Doctor.create({ storeId: req.user.store_id, name, specialty });
        res.json({ success: true, doctor });
    } catch (error) {
        console.error('Error creating doctor:', error);
        res.status(500).json({ success: false, error: 'Error al crear doctor' });
    }
});

// PUT /api/appointments/doctors/:id - Actualizar doctor
router.put('/doctors/:id', requireAuth, (req, res) => {
    try {
        const { name, specialty, active } = req.body;
        const Doctor = require('../models/Doctor');
        const existing = Doctor.getById(req.params.id);
        if (!existing || existing.store_id !== req.user.store_id) {
            return res.status(403).json({ success: false, error: 'Acceso denegado' });
        }
        
        const doctor = Doctor.update(req.params.id, { name, specialty, active });
        res.json({ success: true, doctor });
    } catch (error) {
        console.error('Error updating doctor:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar doctor' });
    }
});

// DELETE /api/appointments/doctors/:id - Eliminar doctor
router.delete('/doctors/:id', requireAuth, (req, res) => {
    try {
        const Doctor = require('../models/Doctor');
        const existing = Doctor.getById(req.params.id);
        if (!existing || existing.store_id !== req.user.store_id) {
            return res.status(403).json({ success: false, error: 'Acceso denegado' });
        }
        
        Doctor.delete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting doctor:', error);
        res.status(500).json({ success: false, error: 'Error al eliminar doctor' });
    }
});


// POST /api/appointments - Crear cita manualmente
router.post('/', requireAuth, (req, res) => {
    try {
        const { customerPhone, customerName, service, date, time, duration, notes, doctor } = req.body;

        if (!customerPhone || !service || !date || !time) {
            return res.status(400).json({ 
                success: false, 
                error: 'Teléfono, servicio, fecha y hora son requeridos' 
            });
        }

        // Verificar disponibilidad
        if (!Appointment.isAvailable(req.user.store_id, date, time)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Ese horario no está disponible' 
            });
        }

        // Obtener el objeto del servicio para el precio
        const services = Appointment.getServices(req.user.store_id);
        const serviceObj = services.find(s => s.name === service) || { name: service, price: 0 };

        const appointment = Appointment.create({
            storeId: req.user.store_id,
            customerPhone,
            customerName,
            service: serviceObj,
            date,
            time,
            duration: duration || serviceObj.duration || 30,
            notes,
            doctor
        });

        res.json({ success: true, appointment });
    } catch (error) {
        console.error('Error creating appointment:', error);
        res.status(500).json({ success: false, error: 'Error al crear cita' });
    }
});

// PUT /api/appointments/:id - Editar cita genérica
router.put('/:id', requireAuth, (req, res) => {
    try {
        const existing = Appointment.getById(req.params.id);
        if (!existing || existing.store_id !== req.user.store_id) {
            return res.status(403).json({ success: false, error: 'Acceso denegado' });
        }

        const { customerPhone, customerName, service, date, time, duration, notes, doctor } = req.body;

        if (!customerPhone || !service || !date || !time) {
            return res.status(400).json({ success: false, error: 'Faltan campos obligatorios' });
        }

        // Verificar disponibilidad si cambió fecha u hora
        if (date !== existing.date || time !== existing.time) {
            if (!Appointment.isAvailable(req.user.store_id, date, time)) {
                return res.status(400).json({ success: false, error: 'Ese horario no está disponible' });
            }
        }

        const services = Appointment.getServices(req.user.store_id);
        const serviceObj = services.find(s => s.name === service) || { name: service, price: 0 };

        const appointment = Appointment.update(req.params.id, {
            customerPhone,
            customerName,
            service: serviceObj,
            date,
            time,
            duration: duration || serviceObj.duration || 30,
            notes,
            doctor
        });

        res.json({ success: true, appointment });
    } catch (error) {
        console.error('Error updating appointment:', error);
        res.status(500).json({ success: false, error: 'Error al actualizar cita' });
    }
});

// PUT /api/appointments/:id/confirm - Confirmar cita
router.put('/:id/confirm', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const existing = Appointment.getById(req.params.id);
        if (!existing) return res.status(404).json({ success: false, error: 'Cita no encontrada' });
        if (existing.store_id !== storeId) return res.status(403).json({ success: false, error: 'Acceso denegado' });

        const appointment = Appointment.confirm(req.params.id);
        res.json({ success: true, appointment });
    } catch (error) {
        console.error('Error confirming appointment:', error);
        res.status(500).json({ success: false, error: 'Error al confirmar cita' });
    }
});

// PUT /api/appointments/:id/complete - Completar cita
router.put('/:id/complete', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const existing = Appointment.getById(req.params.id);
        if (!existing) return res.status(404).json({ success: false, error: 'Cita no encontrada' });
        if (existing.store_id !== storeId) return res.status(403).json({ success: false, error: 'Acceso denegado' });

        const appointment = Appointment.complete(req.params.id);
        res.json({ success: true, appointment });
    } catch (error) {
        console.error('Error completing appointment:', error);
        res.status(500).json({ success: false, error: 'Error al completar cita' });
    }
});

// PUT /api/appointments/:id/cancel - Cancelar cita
router.put('/:id/cancel', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const existing = Appointment.getById(req.params.id);
        if (!existing) return res.status(404).json({ success: false, error: 'Cita no encontrada' });
        if (existing.store_id !== storeId) return res.status(403).json({ success: false, error: 'Acceso denegado' });

        const { reason } = req.body;
        const appointment = Appointment.cancel(req.params.id, reason || '');
        res.json({ success: true, appointment });
    } catch (error) {
        console.error('Error cancelling appointment:', error);
        res.status(500).json({ success: false, error: 'Error al cancelar cita' });
    }
});

// PUT /api/appointments/:id/reschedule - Reagendar cita
router.put('/:id/reschedule', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const existing = Appointment.getById(req.params.id);
        if (!existing) return res.status(404).json({ success: false, error: 'Cita no encontrada' });
        if (existing.store_id !== storeId) return res.status(403).json({ success: false, error: 'Acceso denegado' });

        const { date, time } = req.body;
        if (!date || !time) {
            return res.status(400).json({ success: false, error: 'Fecha y hora son requeridas' });
        }

        // Verificar disponibilidad del nuevo horario
        if (!Appointment.isAvailable(storeId, date, time)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Ese horario no está disponible' 
            });
        }

        const appointment = Appointment.reschedule(req.params.id, date, time);
        res.json({ success: true, appointment });
    } catch (error) {
        console.error('Error rescheduling appointment:', error);
        res.status(500).json({ success: false, error: 'Error al reagendar cita' });
    }
});

// GET /api/appointments/customer/:phone - Citas de un cliente
router.get('/customer/:phone', requireAuth, (req, res) => {
    try {
        const appointments = Appointment.getCustomerAppointments(req.user.store_id, req.params.phone);
        res.json({ success: true, appointments });
    } catch (error) {
        console.error('Error getting customer appointments:', error);
        res.status(500).json({ success: false, error: 'Error al obtener citas del cliente' });
    }
});

module.exports = router;

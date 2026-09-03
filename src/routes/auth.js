const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const Store = require('../models/Store');
const BUSINESS_TEMPLATES = require('../config/businessTemplates');

// Limitador de tasa contra ataques de fuerza bruta en login (10 intentos por 15 min)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).render('login', {
            title: 'Iniciar Sesión — WaBot SaaS',
            error: 'Demasiados intentos de acceso fallidos desde esta IP. Por favor, intentá nuevamente en 15 minutos.'
        });
    }
});

// Limitador de tasa para registro de cuentas (10 registros por IP por hora)
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).render('register', {
            title: 'Crear Cuenta — WaBot SaaS',
            templates: BUSINESS_TEMPLATES,
            error: 'Demasiadas solicitudes de registro desde esta IP. Por favor, intentá más tarde.'
        });
    }
});

/**
 * GET /register
 * Formulario de registro.
 */
router.get('/register', (req, res) => {
    if (req.session && req.session.userId) {
        return res.redirect('/dashboard');
    }
    res.render('register', {
        title: 'Crear Cuenta — WaBot SaaS',
        templates: BUSINESS_TEMPLATES,
        error: null
    });
});

/**
 * POST /register
 * Procesar registro de nuevo usuario.
 */
router.post('/register', registerLimiter, async (req, res) => {
    try {
        const { name, email, password, confirmPassword, businessType, operatingMode, storeName, phone, address } = req.body;

        // Validaciones
        if (!name || !email || !password) {
            return res.render('register', {
                title: 'Crear Cuenta — WaBot SaaS',
                templates: BUSINESS_TEMPLATES,
                error: 'Nombre, email y contraseña son requeridos'
            });
        }

        if (password !== confirmPassword) {
            return res.render('register', {
                title: 'Crear Cuenta — WaBot SaaS',
                templates: BUSINESS_TEMPLATES,
                error: 'Las contraseñas no coinciden'
            });
        }

        if (password.length < 6) {
            return res.render('register', {
                title: 'Crear Cuenta — WaBot SaaS',
                templates: BUSINESS_TEMPLATES,
                error: 'La contraseña debe tener al menos 6 caracteres'
            });
        }

        // Verificar si el email ya existe
        const existingUser = User.findByEmail(email);
        if (existingUser) {
            return res.render('register', {
                title: 'Crear Cuenta — WaBot SaaS',
                templates: BUSINESS_TEMPLATES,
                error: 'Este email ya está registrado'
            });
        }

        // Obtener template del negocio
        const template = BUSINESS_TEMPLATES[businessType] || BUSINESS_TEMPLATES.general;
        const isClinic = operatingMode === 'clinic';
        const isHostel = operatingMode === 'hostel';

        // Ajustar emoji y prompt según el modo operativo si no se especificó un template especializado
        let emoji = template.emoji || '🏪';
        let aiPrompt = template.aiPrompt || '';
        let categories = template.categories;

        if (isClinic) {
            emoji = '🏥';
            aiPrompt = 'Sos un asistente médico virtual para agendamiento de citas y turnos en la clínica. Atendé a los pacientes con amabilidad, consultá qué servicio o especialidad buscan y ayudalos a agendar su consulta.';
            categories = ['Consultas Generales', 'Especialidades', 'Estudios', 'Tratamientos'];
        } else if (isHostel) {
            emoji = '🏨';
            aiPrompt = 'Sos un recepcionista virtual de hostel y alojamiento. Ayudá a los huéspedes a consultar disponibilidad de habitaciones o camas, fechas de check-in / check-out y gestionar su reserva.';
            categories = ['Dormitorios Compartidos', 'Habitaciones Privadas', 'Suites', 'Servicios Adicionales'];
        }

        // Crear store con el modo operativo elegido
        const store = await Store.create({
            name: storeName || 'Mi Negocio',
            phone: phone || '',
            address: address || '',
            adminPassword: password, // Temporal, el usuario real usa email+pass
            botName: isClinic ? 'Recepción Médica' : (isHostel ? 'Recepción Hostel' : 'Bot'),
            businessType: businessType || (isClinic ? 'clinic' : (isHostel ? 'hostel' : 'general')),
            aiPrompt: aiPrompt,
            categories: categories,
            themeEmoji: emoji,
            currency: 'USD',
            clinicMode: isClinic ? 1 : 0,
            hostelMode: isHostel ? 1 : 0
        });

        // Crear usuario
        const user = await User.create({
            email,
            password,
            name,
            role: 'owner',
            storeId: store.id
        });

        // Actualizar store con el owner
        Store.update(store.id, { ownerUserId: user.id });

        // Login automático
        req.session.userId = user.id;
        req.session.storeId = store.id;

        // Redirigir al onboarding
        res.redirect('/onboarding');

    } catch (error) {
        console.error('Error en registro:', error);
        res.render('register', {
            title: 'Crear Cuenta — WaBot SaaS',
            templates: BUSINESS_TEMPLATES,
            error: 'Error al crear la cuenta. Intentá de nuevo.'
        });
    }
});

/**
 * GET /login
 * Formulario de login.
 */
router.get('/login', (req, res) => {
    if (req.session && req.session.userId) {
        return res.redirect('/dashboard');
    }
    res.render('login', {
        title: 'Iniciar Sesión — WaBot SaaS',
        error: null
    });
});

/**
 * POST /login
 * Procesar login.
 */
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.render('login', {
                title: 'Iniciar Sesión — WaBot SaaS',
                error: 'Email y contraseña son requeridos'
            });
        }

        const user = await User.verifyPassword(email, password);
        
        if (!user) {
            return res.render('login', {
                title: 'Iniciar Sesión — WaBot SaaS',
                error: 'Email o contraseña incorrectos'
            });
        }

        // Crear sesión
        req.session.userId = user.id;
        req.session.storeId = user.store_id;

        // Redirigir al dashboard
        res.redirect('/dashboard');

    } catch (error) {
        console.error('Error en login:', error);
        res.render('login', {
            title: 'Iniciar Sesión — WaBot SaaS',
            error: 'Error al iniciar sesión. Intentá de nuevo.'
        });
    }
});

function handleLogout(req, res) {
    if (req.session && typeof req.session.destroy === 'function') {
        req.session.destroy((err) => {
            if (err) console.error("Error al destruir sesión:", err);
            res.redirect('/');
        });
    } else {
        res.redirect('/');
    }
}

/**
 * GET /logout y POST /logout
 * Cerrar sesión de forma segura.
 */
router.get('/logout', handleLogout);
router.post('/logout', handleLogout);

module.exports = router;

const express = require('express');
const router = express.Router();
const Store = require('../models/Store');
const Order = require('../models/Order');
const Appointment = require('../models/Appointment');
const Booking = require('../models/Booking');
const Driver = require('../models/Driver');
const AudioService = require('../services/audio');
const mediaStore = require('../services/mediaStore');
const { getVisionService } = require('../services/visionService');
const { requireAuth } = require('../middleware/auth');
const BUSINESS_TEMPLATES = require('../config/businessTemplates');

/**
 * GET /
 * Landing page (si no está logueado) o Dashboard (si está logueado).
 */
router.get('/', (req, res) => {
    if (req.session && req.session.userId) {
        return res.redirect('/dashboard');
    }
    const db = require('../config/db').getDb();
    let plans = [];
    try {
        plans = db.prepare('SELECT * FROM saas_plans WHERE active = 1 ORDER BY sort_order ASC').all();
    } catch (e) {
        console.error('Error fetching plans:', e);
    }
    
    res.render('landing', {
        title: 'WaBot SaaS — Asistente IA para tu Negocio',
        templates: BUSINESS_TEMPLATES,
        plans: plans
    });
});

/**
 * GET /dashboard
 * Dashboard principal post-login.
 */
router.get('/dashboard', requireAuth, (req, res) => {
    let storeId = req.user.store_id;
    if (!storeId && req.user.role === 'superadmin') {
        const firstStore = Store.getAll()[0];
        storeId = firstStore ? firstStore.id : null;
    }
    const store = storeId ? Store.getById(storeId) : null;
    
    const pendingOrders = storeId ? Order.getPending(storeId) : [];
    const orderHistory = storeId ? Order.getHistory(storeId, 10) : [];
    
    res.render('dashboard', {
        store: store,
        user: req.user,
        pendingCount: pendingOrders.length,
        recentOrders: orderHistory.slice(0, 5),
        title: 'Dashboard — ' + (store ? store.name : 'WaBot SaaS')
    });
});

/**
 * GET /onboarding
 * Wizard de primer uso post-registro.
 */
router.get('/onboarding', requireAuth, (req, res) => {
    let storeId = req.user.store_id;
    if (!storeId && req.user.role === 'superadmin') {
        const firstStore = Store.getAll()[0];
        storeId = firstStore ? firstStore.id : null;
    }
    const store = storeId ? Store.getById(storeId) : null;
    
    res.render('onboarding', {
        store: store,
        user: req.user,
        templates: BUSINESS_TEMPLATES,
        title: 'Configuración Inicial — WaBot SaaS'
    });
});

/**
 * GET /pedidos
 * Dashboard de pedidos (modo kiosk para tablet).
 */
router.get('/pedidos', requireAuth, (req, res) => {
    // Obtener storeId del usuario autenticado; solo superadmin puede alternar ?store=ID
    let storeId = req.user.store_id;
    if (req.user.role === 'superadmin' && req.query.store) {
        storeId = parseInt(req.query.store, 10);
    }

    if (!storeId) {
        return res.redirect('/dashboard');
    }

    const store = Store.getById(storeId);
    if (!store) {
        return res.redirect('/dashboard');
    }

    const pendingOrders = Order.getPending(storeId);
    const readyOrders = Order.getReady(storeId);
    const drivers = Driver.getByStoreId(storeId);

    res.render('pedidos', {
        store: store,
        orders: pendingOrders,
        readyOrders: readyOrders,
        drivers: drivers,
        title: 'Pedidos — ' + (store ? store.name : 'WaBot SaaS')
    });
});

/**
 * GET /admin
 * Panel de administración.
 */
router.get('/admin', requireAuth, (req, res) => {
    let storeId = req.user.store_id;
    if (!storeId && req.user.role === 'superadmin') {
        const firstStore = Store.getAll()[0];
        storeId = firstStore ? firstStore.id : null;
    }
    const store = storeId ? Store.getById(storeId) : null;

    res.render('admin', {
        store: store,
        user: req.user,
        title: 'Admin — ' + (store ? store.name : 'WaBot SaaS')
    });
});

/**
 * GET /simulator
 * Interfaz para simular chat de cliente.
 */
router.get('/simulator', requireAuth, (req, res) => {
    let storeId = req.user.store_id;
    if (!storeId && req.user.role === 'superadmin') {
        const firstStore = Store.getAll()[0];
        storeId = firstStore ? firstStore.id : null;
    }
    const store = storeId ? Store.getById(storeId) : null;

    res.render('simulator', {
        title: 'Simulador Chat — ' + (store ? store.name : 'WaBot SaaS'),
        store: store,
        user: req.user
    });
});

/**
 * POST /api/simulate
 * Endpoint sincrono para el simulador de chat (Soporta Texto, Audio e Imágenes)
 */
router.post('/api/simulate', requireAuth, async (req, res) => {
    const startTime = Date.now();
    try {
        let { messageText, phone, audioBase64, imageBase64, imageMimeType, imageCaption } = req.body;
        let storeId = req.user.store_id;
        if (!storeId && req.user.role === 'superadmin') {
            const firstStore = Store.getAll()[0];
            storeId = firstStore ? firstStore.id : null;
        }

        let transcriptionText = null;
        let savedMedia = null;

        // 1. Procesar Audio (Voz) si se envió
        if (audioBase64) {
            const base64AudioData = audioBase64.includes('base64,') ? audioBase64.split('base64,')[1] : audioBase64;
            const audioBuffer = Buffer.from(base64AudioData, 'base64');
            const transcribed = await AudioService.transcribeBuffer(audioBuffer, 'audio/webm');
            if (transcribed) {
                messageText = transcribed;
                transcriptionText = transcribed;
            } else {
                return res.status(500).json({ error: 'No se pudo transcribir el audio' });
            }
        }

        // 2. Procesar Imagen con Visión si se envió
        if (imageBase64) {
            const base64ImageData = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64;
            const mime = imageMimeType || 'image/jpeg';
            const filename = mime.includes('png') ? 'sim_img.png' : 'sim_img.jpg';

            try {
                savedMedia = mediaStore.saveMedia(storeId, Buffer.from(base64ImageData, 'base64'), filename, mime);
                const visionService = getVisionService();
                const prompt = imageCaption 
                    ? `El cliente envió esta imagen con el mensaje: "${imageCaption}". Analiza la imagen y describe qué es. Si es un producto de menú o catálogo, indica nombre, precio visible y detalles.`
                    : 'Analiza esta imagen enviada por un cliente. Si es un producto de menú o catálogo, indica nombre, precio visible y detalles. Si parece un plato de comida, habitación de hostel o servicio médico, descríbelo.';

                const imageDescription = await visionService.analyzeImage(base64ImageData, prompt, mime);
                if (imageDescription) {
                    const imageContext = `[El cliente envió una imagen. Descripción de la imagen: ${imageDescription}]`;
                    messageText = imageCaption 
                        ? `${imageCaption}\n\n${imageContext}`
                        : `El cliente envió una imagen sin texto. ${imageContext}`;
                } else {
                    messageText = imageCaption || 'El cliente envió una imagen.';
                }
            } catch (err) {
                console.error('Error procesando imagen en simulador:', err.message);
                messageText = imageCaption || 'El cliente envió una imagen que no se pudo analizar.';
            }
        }

        if (!messageText) {
            return res.status(400).json({ error: 'Mensaje requerido' });
        }

        const langchain = require('../services/langchain').getLangChainService();
        const result = await langchain.processMessage(messageText, storeId, phone, { isSimulation: true });
        const elapsedMs = Date.now() - startTime;
        
        // A. Manejo de Pedidos (Comercio / Gastronomía)
        if (result.order) {
            const orderData = result.order;
            const items = orderData.items.map(item => ({
                product_name: item.producto,
                quantity: item.cantidad || 1,
                unit_price: item.precio_unitario || 0,
                details: item.detalles || ''
            }));
            
            const mediaUrls = savedMedia ? [savedMedia.url] : [];

            const order = Order.create({
                storeId: storeId,
                customerPhone: phone,
                customerName: orderData.nombre_cliente || '',
                address: orderData.direccion,
                paymentMethod: orderData.metodo_pago,
                items: items,
                notes: orderData.notas || '',
                mediaUrls: mediaUrls.length > 0 ? JSON.stringify(mediaUrls) : null
            });
            
            const io = req.app.get('io');
            if (io) {
                io.to(`store_${storeId}_pedidos`).emit('nuevo-pedido', order);
            }
            
            res.json({ 
                reply: `✅ *¡Pedido recibido!* (N° ${order.order_number})\n\n👤 Cliente: ${order.customer_name || 'Sin especificar'}\n📍 Entrega: ${orderData.direccion}\n💰 Total: $${order.total}\n💳 Pago: ${orderData.metodo_pago}\n\n⏱ Enseguida marcha. Te avisamos cuando esté listo. (SIMULADO)`,
                transcription: transcriptionText,
                images: result.images || [],
                telemetry: { elapsedMs }
            });
            return;
        }
        
        // B. Manejo de Citas (Clínica / Servicios)
        if (result.appointment) {
            const aptData = result.appointment;
            const services = Appointment.getServices(storeId);
            const serviceObj = services.find(s => s.name === aptData.servicio) || { price: 0, duration: 30 };
            
            const appointment = Appointment.create({
                storeId: storeId,
                customerPhone: phone,
                customerName: aptData.nombre_cliente || '',
                service: { name: aptData.servicio, price: aptData.precio || serviceObj.price },
                date: aptData.fecha,
                time: aptData.hora,
                duration: aptData.duracion || serviceObj.duration || 30,
                notes: aptData.notas || aptData.notes || '',
                doctor: aptData.doctor || null
            });
            
            const io = req.app.get('io');
            if (io) {
                io.to(`store_${storeId}_admin`).emit('nueva-cita', appointment);
            }
            
            res.json({ 
                reply: `✅ *Cita agendada con éxito!* (N° ${appointment.appointment_number})\n\n📋 Servicio: ${aptData.servicio}\n📅 Fecha: ${aptData.fecha.split('-').reverse().join('/')}\n🕐 Hora: ${aptData.hora}\n👤 Paciente: ${aptData.nombre_cliente || 'Sin Nombre'}\n${aptData.doctor ? `👨‍⚕️ Profesional: ${aptData.doctor}\n` : ''}\n(SIMULADO)`,
                transcription: transcriptionText,
                images: result.images || [],
                telemetry: { elapsedMs }
            });
            return;
        }

        // C. Manejo de Reservas de Hostel (Alojamiento)
        if (result.booking) {
            const bData = result.booking;
            const booking = Booking.create({
                storeId: storeId,
                customerPhone: phone,
                customerName: bData.nombre_cliente || '',
                roomId: bData.room_id || null,
                roomName: bData.tipo_habitacion || bData.habitacion || 'Habitación Hostel',
                checkInDate: bData.check_in,
                checkOutDate: bData.check_out,
                guestsCount: bData.huespedes || 1,
                totalPrice: bData.precio_total || 0,
                paymentMethod: bData.metodo_pago || 'Efectivo',
                notes: bData.notas || ''
            });

            const io = req.app.get('io');
            if (io) {
                io.to(`store_${storeId}_admin`).emit('nueva-reserva-hostel', booking);
            }

            res.json({
                reply: `🏨 *¡Reserva confirmada con éxito!* (N° ${booking.booking_number})\n\n👤 Huésped: ${booking.customer_name || 'Sin Nombre'}\n🛏️ Habitación: ${booking.room_name}\n📅 Check-in: ${bData.check_in} | Check-out: ${bData.check_out}\n👥 Huéspedes: ${bData.huespedes || 1}\n💰 Total: $${bData.precio_total}\n💳 Pago: ${bData.metodo_pago || 'Efectivo'}\n\n(SIMULADO)`,
                transcription: transcriptionText,
                images: result.images || [],
                telemetry: { elapsedMs }
            });
            return;
        }
        
        // D. Spam detectado
        if (result.es_spam) {
            res.json({ 
                reply: `🚫 *SPAM DETECTADO:* ${result.response}`,
                transcription: transcriptionText,
                images: result.images || [],
                telemetry: { elapsedMs }
            });
            return;
        }

        // E. Requiere operador humano
        if (result.requiere_humano) {
            res.json({ 
                reply: result.response,
                transcription: transcriptionText,
                images: result.images || [],
                telemetry: { elapsedMs },
                needsHuman: true
            });
            return;
        }
        
        // F. Respuesta conversacional estándar
        const cleanResponse = result.response.replace(/```json[\s\S]*?```/g, '').trim();
        res.json({ 
            reply: cleanResponse,
            transcription: transcriptionText,
            images: result.images || [],
            telemetry: { elapsedMs }
        });
    } catch (error) {
        console.error('Error en simulador:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/simulate/reset
 * Reiniciar la conversación en BD para un teléfono simulado.
 */
router.post('/api/simulate/reset', requireAuth, (req, res) => {
    try {
        const { phone } = req.body;
        let storeId = req.user.store_id;
        if (!storeId && req.user.role === 'superadmin') {
            const firstStore = Store.getAll()[0];
            storeId = firstStore ? firstStore.id : null;
        }
        if (phone && storeId) {
            const db = require('../config/db').getDb();
            db.prepare("DELETE FROM conversations WHERE store_id = ? AND customer_phone = ?").run(storeId, phone);
        }
        res.json({ success: true });
    } catch (e) {
        console.error('Error reseteando conversación simulada:', e.message);
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/store
 * Obtener datos del local actual.
 */
router.get('/api/store', requireAuth, (req, res) => {
    try {
        let storeId = req.user.store_id;
        if (!storeId && req.user.role === 'superadmin') {
            const firstStore = Store.getAll()[0];
            storeId = firstStore ? firstStore.id : null;
        }
        const store = storeId ? Store.getById(storeId) : null;
        res.json(store);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/store
 * Actualizar configuraciones del local.
 */
router.put('/api/store', requireAuth, (req, res) => {
    try {
        let storeId = req.user.store_id;
        if (!storeId && req.user.role === 'superadmin') {
            const firstStore = Store.getAll()[0];
            storeId = firstStore ? firstStore.id : null;
        }
        const currentStore = storeId ? Store.getById(storeId) : null;
        const { name, phone, address, botName, businessType, aiPrompt, categories, themeEmoji, welcomeMessage, currency, description, notifyPhone, notifyEmail, notificationEvents, seedCatalog } = req.body;
        
        const finalName = name || (currentStore ? currentStore.name : 'Mi Local');
        const finalPhone = phone || (currentStore ? currentStore.phone : `store_${Date.now()}`);

        if (!storeId) {
            return res.status(400).json({ error: 'No se encontró un local para actualizar' });
        }

        const updated = Store.update(storeId, {
            name: finalName,
            phone: finalPhone,
            address, botName, businessType,
            aiPrompt: aiPrompt || description,
            categories, themeEmoji, welcomeMessage, currency,
            notify_phone: notifyPhone,
            notify_email: notifyEmail,
            notification_events: notificationEvents
        });

        // Sembrado automático de productos de muestra si el cliente lo solicita
        if (seedCatalog && businessType) {
            const Product = require('../models/Product');
            const existingProducts = Product.getByStoreId(storeId);
            if (existingProducts.length === 0) {
                const template = BUSINESS_TEMPLATES[businessType] || BUSINESS_TEMPLATES.general;
                if (template && template.sampleProducts && Array.isArray(template.sampleProducts)) {
                    console.log(`🌱 Sembrando ${template.sampleProducts.length} productos de prueba para tienda ID ${storeId}...`);
                    for (const sample of template.sampleProducts) {
                        Product.create({
                            storeId,
                            name: sample.name,
                            description: sample.description || '',
                            price: sample.price || 100,
                            category: sample.category || 'General',
                            duration: 30,
                            is_service: false
                        });
                    }
                }
            }
        }

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/business-templates
 * Obtener plantillas de negocio disponibles.
 */
router.get('/api/business-templates', requireAuth, (req, res) => {
    res.json(BUSINESS_TEMPLATES);
});

/**
 * GET /pricing
 * Página de planes.
 */
router.get('/pricing', (req, res) => {
    res.render('pricing', {
        title: 'Planes y Precios — WaBot SaaS',
        user: req.session.userId ? req.user : null
    });
});

/**
 * PUT /api/store/clinic-mode
 * Activar/desactivar modo clínica.
 */
router.put('/api/store/clinic-mode', requireAuth, (req, res) => {
    try {
        let storeId = req.user.store_id;
        if (!storeId && req.user.role === 'superadmin') {
            const firstStore = Store.getAll()[0];
            storeId = firstStore ? firstStore.id : null;
        }
        const { clinic_mode } = req.body;

        if (!storeId) {
            return res.status(400).json({ error: 'No se encontró un local para actualizar' });
        }

        const db = require('../config/db').getDb();
        db.prepare('UPDATE stores SET clinic_mode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(clinic_mode ? 1 : 0, storeId);

        const store = Store.getById(storeId);
        res.json({ success: true, store });
    } catch (error) {
        console.error('Error updating clinic mode:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/store/hostel-mode
 * Activar/desactivar modo hostel.
 */
router.put('/api/store/hostel-mode', requireAuth, (req, res) => {
    try {
        let storeId = req.user.store_id;
        if (!storeId && req.user.role === 'superadmin') {
            const firstStore = Store.getAll()[0];
            storeId = firstStore ? firstStore.id : null;
        }
        const { hostel_mode } = req.body;

        if (!storeId) {
            return res.status(400).json({ error: 'No se encontró un local para actualizar' });
        }

        const db = require('../config/db').getDb();
        db.prepare('UPDATE stores SET hostel_mode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(hostel_mode ? 1 : 0, storeId);

        const store = Store.getById(storeId);
        res.json({ success: true, store });
    } catch (error) {
        console.error('Error updating hostel mode:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/store/clinic-settings
 * Guardar configuración de horarios de clínica.
 */
router.put('/api/store/clinic-settings', requireAuth, (req, res) => {
    try {
        let storeId = req.user.store_id;
        if (!storeId && req.user.role === 'superadmin') {
            const firstStore = Store.getAll()[0];
            storeId = firstStore ? firstStore.id : null;
        }
        const { working_hours, slot_duration } = req.body;

        if (!storeId) {
            return res.status(400).json({ error: 'No se encontró un local para actualizar' });
        }

        const db = require('../config/db').getDb();
        db.prepare('UPDATE stores SET working_hours = ?, slot_duration = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(working_hours, slot_duration, storeId);

        const store = Store.getById(storeId);
        res.json({ success: true, store });
    } catch (error) {
        console.error('Error updating clinic settings:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/ai/generate-prompt
 * Generar un System Prompt profesional usando el Agente Generador de IA.
 */
router.post('/api/ai/generate-prompt', requireAuth, async (req, res) => {
    try {
        const { description, tone, rules, businessType } = req.body;
        const PromptGeneratorService = require('../services/promptGeneratorService');
        
        const generatedPrompt = await PromptGeneratorService.generatePrompt({
            description,
            tone,
            rules,
            businessType
        });

        res.json({ success: true, generatedPrompt });
    } catch (error) {
        console.error('Error generando prompt con IA:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

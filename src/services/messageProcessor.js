const { getLangChainService } = require('./langchain');
const { getVisionService } = require('./visionService');
const AudioService = require('./audio');
const mediaStore = require('./mediaStore');
const Store = require('../models/Store');
const Order = require('../models/Order');
const Appointment = require('../models/Appointment');
const Booking = require('../models/Booking');
const Room = require('../models/Room');
const Customer = require('../models/Customer');
const NotificationService = require('./NotificationService');

// Memoria para Rate Limiting (Anti-Spam)
const rateLimits = new Map();
// Memoria para Rate Limiting por Store (Protección Tokens IA)
const storeRateLimits = new Map();
// Limpiar entradas expiradas de rate limits cada hora para evitar fugas de memoria
setInterval(() => {
    const now = Date.now();
    for (const [phone, info] of rateLimits.entries()) {
        // Si ya pasó el bloqueo y pasó más de 2 minutos desde el primer mensaje de la ventana, borrar
        if (info.blockedUntil < now && (now - info.firstMsgTime > 120000)) {
            rateLimits.delete(phone);
        }
    }
    for (const [storeId, info] of storeRateLimits.entries()) {
        if (info.blockedUntil < now && (now - info.firstMsgTime > 120000)) {
            storeRateLimits.delete(storeId);
        }
    }
}, 60 * 60 * 1000).unref();

class MessageProcessor {
    /**
     * Procesa un mensaje entrante estándar, independientemente del proveedor.
     * @param {string} messageText - El texto del mensaje.
     * @param {string} customerPhone - Teléfono del cliente con '+'.
     * @param {string|null} audioMessageId - ID del audio si el mensaje es de voz, null si es texto.
     * @param {object} provider - Instancia del WhatsappProvider activo (Baileys o Meta).
     * @param {object} io - Instancia de Socket.io.
     * @param {object} metadata - Objeto con data extra cruda por si el provider la necesita para bajar media.
     * @param {string|null} customerName - Nombre del cliente de WhatsApp.
     * @param {object|null} mediaData - Datos de media entrante: { type, mediaId, caption, mimeType }
     */
    static async handleIncoming(messageText, customerPhone, audioMessageId, provider, io, metadata, customerName = null, mediaData = null) {
        try {
            // ── Guard: Bot apagado ──────────────────────────────────────────
            const BotState = require('../models/BotState');
            if (!BotState.isActive()) {
                console.log(`🔕 Bot apagado. Ignorando mensaje de ${customerPhone}`);
                return;
            }
            // ───────────────────────────────────────────────────────────────

            // Identificar el local: buscar por el número de WhatsApp configurado o por el ID asociado al proveedor
            const db = require('../config/db').getDb();
            let store = null;
            
            if (provider && provider.storeId) {
                store = db.prepare("SELECT * FROM stores WHERE id = ? AND active = 1").get(provider.storeId);
            }
            
            if (!store) {
                const whatsappMode = db.prepare("SELECT value FROM settings WHERE key = 'whatsapp_mode'").get();
                if (whatsappMode && whatsappMode.value === 'meta') {
                    const phoneId = db.prepare("SELECT value FROM settings WHERE key = 'meta_phone_id'").get();
                    if (phoneId) {
                        store = db.prepare("SELECT * FROM stores WHERE phone LIKE ? AND active = 1 LIMIT 1").get(`%${phoneId.value}%`);
                    }
                }
            }
            
            if (!store) {
                store = db.prepare("SELECT * FROM stores WHERE active = 1 ORDER BY id LIMIT 1").get();
            }
            
            if (!store) {
                console.error('❌ No hay local configurado');
                return;
            }

            // --- Rate Limiting (Filtro Anti-Spam) ---
            const now = Date.now();
            const limitInfo = rateLimits.get(customerPhone) || { count: 0, firstMsgTime: now, blockedUntil: 0 };
            
            if (limitInfo.blockedUntil > now) {
                return; // Ignorar silenciosamente
            }
            
            if (now - limitInfo.firstMsgTime > 60000) {
                limitInfo.count = 0;
                limitInfo.firstMsgTime = now;
            }
            
            limitInfo.count++;
            if (limitInfo.count > 10) {
                limitInfo.blockedUntil = now + (24 * 60 * 60 * 1000); // 24 horas
                rateLimits.set(customerPhone, limitInfo);
                console.log(`🚫 ${customerPhone} bloqueado por enviar demasiados mensajes.`);
                await provider.sendTextMessage(customerPhone, "Has enviado demasiados mensajes muy rápido. Tu número ha sido bloqueado temporalmente.");
                return;
            }
            rateLimits.set(customerPhone, limitInfo);
            // ----------------------------------------

            // --- Rate Limiting IA por Tienda ---
            // Protege el consumo excesivo de tokens a nivel global de una tienda en un corto periodo.
            const storeLimitInfo = storeRateLimits.get(store.id) || { count: 0, firstMsgTime: now, blockedUntil: 0 };
            if (storeLimitInfo.blockedUntil > now) {
                await provider.sendTextMessage(customerPhone, "⏳ El sistema está procesando demasiadas solicitudes en este momento. Por favor, aguarda un minuto.");
                return;
            }
            if (now - storeLimitInfo.firstMsgTime > 60000) {
                storeLimitInfo.count = 0;
                storeLimitInfo.firstMsgTime = now;
            }
            storeLimitInfo.count++;
            // Límite conservador: máximo 30 mensajes por minuto por tienda en su conjunto
            if (storeLimitInfo.count > 30) {
                storeLimitInfo.blockedUntil = now + 60000; // Bloqueo de 1 minuto
                storeRateLimits.set(store.id, storeLimitInfo);
                console.warn(`⚠️ Tienda ID ${store.id} superó el rate limit de IA (30 msg/min). Aplicando throttle.`);
                await provider.sendTextMessage(customerPhone, "⏳ El bot está recibiendo demasiados mensajes. Por favor, aguarda un instante.");
                return;
            }
            storeRateLimits.set(store.id, storeLimitInfo);
            // ----------------------------------------

            // Si es audio, transcribirlo
            if (audioMessageId) {
                console.log(`🎤 Audio recibido de ${customerPhone}, descargando y transcribiendo...`);
                try {
                    const base64Audio = await provider.downloadMedia(audioMessageId, metadata);
                    messageText = await AudioService.transcribeBase64(base64Audio);
                } catch (e) {
                    console.error("Error transcribiendo audio:", e.message);
                    await provider.sendTextMessage(customerPhone, '¡Disculpá! No pude entender el audio. ¿Podés escribirme tu pedido? 📝');
                    return;
                }
                
                if (!messageText) {
                    await provider.sendTextMessage(customerPhone, '¡Disculpá! No pude entender el audio. ¿Podés escribirme tu pedido? 📝');
                    return;
                }
            }

            // Si es imagen/video, analizar con visión y guardar
            let imageDescription = null;
            let savedMedia = null;
            
            if (mediaData && (mediaData.type === 'image' || mediaData.type === 'video')) {
                console.log(`📸 ${mediaData.type === 'image' ? 'Imagen' : 'Video'} recibido de ${customerPhone}, analizando con IA...`);
                
                try {
                    // Descargar media
                    const base64Media = await provider.downloadMedia(mediaData.mediaId, metadata);
                    
                    // Guardar en disco
                    const mimeType = mediaData.mimeType || (mediaData.type === 'image' ? 'image/jpeg' : 'video/mp4');
                    const filename = mediaData.type === 'image' ? 'foto_whatsapp.jpg' : 'video_whatsapp.mp4';
                    savedMedia = mediaStore.saveMedia(store.id, Buffer.from(base64Media, 'base64'), filename, mimeType);
                    
                    // Analizar con visión
                    const visionService = getVisionService();
                    const prompt = mediaData.caption 
                        ? `El cliente envió esta imagen con el mensaje: "${mediaData.caption}". Analiza la imagen y describe qué es. Si es un producto de menú o catálogo, indica nombre, precio visible y detalles.`
                        : 'Analiza esta imagen enviada por un cliente. Si es un producto de menú o catálogo, indica nombre, precio visible y detalles. Si parece un plato de comida, descríbelo.';
                    
                    imageDescription = await visionService.analyzeImage(base64Media, prompt, mimeType);
                    
                    if (imageDescription) {
                        // Construir texto para la IA con la descripción de la imagen
                        const imageContext = `[El cliente envió una imagen. Descripción de la imagen: ${imageDescription}]`;
                        messageText = mediaData.caption 
                            ? `${mediaData.caption}\n\n${imageContext}`
                            : `El cliente envió una imagen sin texto. ${imageContext}`;
                    }
                } catch (e) {
                    console.error("Error procesando media:", e.message);
                    // Fallback: guardar la imagen pero sin análisis
                    messageText = mediaData.caption || 'El cliente envió una imagen pero no pude analizarla. ¿Qué necesitás?';
                }
            }

            // Si es documento, guardarlo
            if (mediaData && mediaData.type === 'document') {
                console.log(`📄 Documento recibido de ${customerPhone}, guardando...`);
                
                try {
                    const base64Doc = await provider.downloadMedia(mediaData.mediaId, metadata);
                    const filename = mediaData.filename || 'documento_whatsapp';
                    savedMedia = mediaStore.saveMedia(store.id, Buffer.from(base64Doc, 'base64'), filename, mediaData.mimeType || 'application/octet-stream');
                    
                    messageText = mediaData.caption 
                        ? `${mediaData.caption}\n\n[El cliente envió un archivo adjunto: ${filename}]`
                        : `El cliente envió un archivo adjunto: ${filename}`;
                } catch (e) {
                    console.error("Error guardando documento:", e.message);
                    messageText = mediaData.caption || 'El cliente envió un archivo adjunto.';
                }
            }

            if (!messageText) return;

            console.log(`📩 Mensaje de ${customerPhone}${customerName ? ` (${customerName})` : ''}: "${messageText.substring(0, 100)}..."`);

            // Registrar/actualizar cliente con su nombre de WhatsApp
            Customer.getOrCreate(store.id, customerPhone, customerName);

            const activeConv = db.prepare(`
                SELECT id, messages, needs_human FROM conversations 
                WHERE store_id = ? AND customer_phone = ? AND status = 'active'
                ORDER BY updated_at DESC LIMIT 1
            `).get(store.id, customerPhone);

            // Si la conversación requiere atención humana, guardar el mensaje y omitir IA
            if (activeConv && activeConv.needs_human === 1) {
                console.log(`👤 Chat con ${customerPhone} requiere atención humana. Guardando y omitiendo IA.`);
                
                const messages = JSON.parse(activeConv.messages);
                messages.push({ role: 'human', content: messageText });
                
                db.prepare(`
                    UPDATE conversations 
                    SET messages = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(JSON.stringify(messages.slice(-20)), activeConv.id);

                // Notificar al panel de administración en tiempo real
                if (io) {
                    io.to('admin').to(`store_${store.id}_admin`).emit('chat-update', {
                        customer_phone: customerPhone,
                        message: { role: 'human', content: messageText, timestamp: new Date().toISOString() }
                    });
                }
                return;
            }

            // Procesar con LangChain
            const langchain = getLangChainService();
            const result = await langchain.processMessage(messageText, store.id, customerPhone);

            // Si la IA detecta que es un Troll / Spam
            if (result.es_spam) {
                console.log(`🚫 IA detectó troll/spam de ${customerPhone}. Bloqueando...`);
                
                // Bloquear número por 24h
                const limitInfo = rateLimits.get(customerPhone) || { count: 0, firstMsgTime: Date.now(), blockedUntil: 0 };
                limitInfo.blockedUntil = Date.now() + (24 * 60 * 60 * 1000);
                rateLimits.set(customerPhone, limitInfo);

                await provider.sendTextMessage(customerPhone, result.response);
                return;
            }

            // Si la IA detecta que requiere atención humana
            if (result.requiere_humano) {
                console.log(`🚨 Derivando chat con ${customerPhone} a humano.`);
                
                db.prepare(`
                    UPDATE conversations 
                    SET needs_human = 1, updated_at = CURRENT_TIMESTAMP
                    WHERE store_id = ? AND customer_phone = ? AND status = 'active'
                `).run(store.id, customerPhone);

                // Enviar respuesta amigable de transición
                await provider.sendTextMessage(customerPhone, result.response);

                // Notificar al admin en tiempo real
                if (io) {
                    io.to('admin').to(`store_${store.id}_admin`).emit('chat-handoff', {
                        customer_phone: customerPhone,
                        message: { role: 'ai', content: result.response, timestamp: new Date().toISOString() }
                    });
                }
                return;
            }

            // Si hay un pedido completo, crearlo en la BD
            if (result.order) {
                const orderData = result.order;

                // Buscar precios reales del catálogo
                const items = orderData.items.map(item => ({
                    product_name: item.producto,
                    quantity: item.cantidad || 1,
                    unit_price: item.precio_unitario || 0,
                    details: item.detalles || ''
                }));

                // El nombre que la IA recopiló tiene prioridad; fallback al pushName de WhatsApp
                const finalCustomerName = orderData.nombre_cliente || customerName || '';

                // Incluir media_urls si se guardó algo
                const mediaUrls = savedMedia ? [savedMedia.url] : [];

                const order = Order.create({
                    storeId: store.id,
                    customerPhone: customerPhone,
                    customerName: finalCustomerName,
                    address: orderData.direccion,
                    paymentMethod: orderData.metodo_pago,
                    items: items,
                    notes: orderData.notas || '',
                    mediaUrls: mediaUrls.length > 0 ? JSON.stringify(mediaUrls) : null
                });
                
                // Nota: Order.create() y Appointment.create() ya actualizan el CRM internamente

                console.log(`🆕 Pedido creado: #${order.order_number} (ID: ${order.id})`);

                NotificationService.notify('new', order, store.id)
                    .catch(e => console.error('Error en aviso externo (new):', e.message));

                // Emitir al dashboard de cocina
                if (io) {
                    io.to('pedidos').to(`store_${store.id}_pedidos`).emit('nuevo-pedido', order);
                }

                // Confirmar al cliente
                await provider.sendOrderConfirmation(customerPhone, order);
            } else if (result.appointment) {
                // Si hay una cita completa, crearla en la BD
                const aptData = result.appointment;
                const finalCustomerName = aptData.nombre_cliente || customerName || '';

                const services = Appointment.getServices(store.id);
                const service = services.find(s => s.name === aptData.servicio) || { price: 0, duration: 30 };

                const appointment = Appointment.create({
                    storeId: store.id,
                    customerPhone: customerPhone,
                    customerName: finalCustomerName,
                    service: { name: aptData.servicio, price: aptData.precio || service.price },
                    date: aptData.fecha,
                    time: aptData.hora,
                    duration: aptData.duracion || service.duration,
                    notes: aptData.notas || aptData.notes || '',
                    doctor: aptData.doctor || null
                });

                console.log(`📅 Cita creada: #${appointment.appointment_number} (ID: ${appointment.id})`);

                // Emitir al dashboard de citas
                if (io) {
                    io.to('admin').to(`store_${store.id}_admin`).emit('nueva-cita', appointment);
                }

                // Confirmar al cliente
                await provider.sendAppointmentConfirmation(customerPhone, appointment, store.name);
            } else if (result.booking) {
                // Si hay una reserva completa de hostel, crearla en la BD
                const bData = result.booking;
                const finalCustomerName = bData.nombre_cliente || customerName || '';

                const booking = Booking.create({
                    storeId: store.id,
                    customerPhone: customerPhone,
                    customerName: finalCustomerName,
                    roomId: bData.room_id || null,
                    roomName: bData.tipo_habitacion || bData.habitacion || 'Habitación Hostel',
                    checkInDate: bData.check_in,
                    checkOutDate: bData.check_out,
                    guestsCount: bData.huespedes || 1,
                    totalPrice: bData.precio_total || 0,
                    paymentMethod: bData.metodo_pago || 'Efectivo',
                    notes: bData.notas || ''
                });

                console.log(`🏨 Reserva de Hostel creada: #${booking.booking_number} (ID: ${booking.id})`);

                // Emitir al dashboard de hostel
                if (io) {
                    io.to('admin').to(`store_${store.id}_admin`).emit('nueva-reserva-hostel', booking);
                }

                // Confirmar al cliente vía WhatsApp
                const cleanResponse = result.response.replace(/```json[\s\S]*?```/g, '').trim();
                await provider.sendTextMessage(customerPhone, cleanResponse);
            } else {
                // Respuesta conversacional (sin pedido/cita/reserva completa)
                // Limpiar JSON del mensaje si existe
                const cleanResponse = result.response.replace(/```json[\s\S]*?```/g, '').trim();
                await provider.sendTextMessage(customerPhone, cleanResponse);
            }

        } catch (error) {
            console.error('❌ Error en MessageProcessor:', error);
        }
    }

    /**
     * Extrae y procesa un mensaje entrante directo de Baileys.
     */
    static async processBaileysMessage(msg, provider) {
        try {
            const customerPhone = '+' + msg.key.remoteJid.replace('@s.whatsapp.net', '');
            let messageText = '';
            let audioId = null;
            let mediaData = null;
            let metadata = { msg };

            const message = msg.message;
            if (!message) return;

            if (message.conversation) {
                messageText = message.conversation;
            } else if (message.extendedTextMessage?.text) {
                messageText = message.extendedTextMessage.text;
            } else if (message.audioMessage) {
                audioId = msg.key.id;
            } else if (message.imageMessage) {
                mediaData = {
                    type: 'image',
                    mediaId: msg.key.id,
                    caption: message.imageMessage.caption || '',
                    mimeType: message.imageMessage.mimetype || 'image/jpeg'
                };
            } else if (message.videoMessage) {
                mediaData = {
                    type: 'video',
                    mediaId: msg.key.id,
                    caption: message.videoMessage.caption || '',
                    mimeType: message.videoMessage.mimetype || 'video/mp4'
                };
            } else if (message.documentMessage) {
                mediaData = {
                    type: 'document',
                    mediaId: msg.key.id,
                    filename: message.documentMessage.fileName || 'documento',
                    caption: message.documentMessage.caption || '',
                    mimeType: message.documentMessage.mimetype || 'application/octet-stream'
                };
            } else if (message.locationMessage || message.liveLocationMessage) {
                const loc = message.locationMessage || message.liveLocationMessage;
                const lat = loc.degreesLatitude;
                const lng = loc.degreesLongitude;
                messageText = `Ubicación compartida: https://maps.google.com/?q=${lat},${lng}`;
            } else {
                return; // Unsupported
            }

            // Extraer nombre del contacto de WhatsApp (pushName)
            const customerName = msg.pushName || null;

            const QueueService = require('./QueueService');
            await QueueService.enqueueMessage({
                storeId: provider ? provider.storeId : null,
                customerPhone,
                messageText,
                audioMessageId: audioId,
                metadata,
                customerName,
                mediaData,
                providerId: provider ? provider.id : null
            });
        } catch (e) {
            console.error('❌ Error parsing Baileys message:', e);
        }
    }
}

module.exports = MessageProcessor;

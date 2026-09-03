const { HumanMessage, SystemMessage, AIMessage, ToolMessage } = require('@langchain/core/messages');
const { createModel } = require('../utils/aiModelFactory');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Appointment = require('../models/Appointment');
const Room = require('../models/Room');
const Booking = require('../models/Booking');
const Store = require('../models/Store');
const { getDb } = require('../config/db');

/**
 * Servicio del Agente de IA usando LangChain.
 * Soporta múltiples proveedores: OpenAI, Google Gemini, Anthropic.
 * Procesa mensajes de WhatsApp, inyecta el catálogo y devuelve un JSON estructurado.
 */
class LangChainService {
    constructor() {
        this.provider = (process.env.AI_PROVIDER || 'openai').toLowerCase();
        this.model = this._createModel();
        console.log(`🧠 Agente IA inicializado con proveedor: ${this.provider}`);
    }

    /**
     * Crear instancia del modelo según el proveedor configurado.
     */
    _createModel() {
        return createModel(this.provider);
    }

    /**
     * Procesar un mensaje del cliente y devolver respuesta + posible pedido, cita o reserva.
     * 
     * @param {string} message - Texto del cliente
     * @param {number} storeId - ID del local
     * @param {string} customerPhone - Teléfono del cliente
     * @returns {Object} { response: string, order: Object|null, appointment: Object|null, booking: Object|null }
     */
    async processMessage(message, storeId, customerPhone) {
        const startTime = Date.now();

        // Obtener tienda/local y cliente
        const store = Store.getById(storeId);
        const Customer = require('../models/Customer');
        const customer = Customer.getByPhone(storeId, customerPhone);

        // Determinar proveedor dinámicamente: Cliente > Tenant Store > Entorno (con fallback automático a token válido)
        const requestedProvider = (customer && customer.ai_provider) || (store && store.ai_provider) || process.env.AI_PROVIDER || 'openai';
        const customApiKey = (store && store.ai_api_key) || null;

        const activeModel = createModel(requestedProvider, customApiKey);
        const isClinicMode = store.clinic_mode === 1;
        const isHostelMode = store.hostel_mode === 1 || store.business_type === 'hostel';

        // Obtener contexto (Catálogo, Servicios o Habitaciones)
        let contextText = '';
        let customerHistory = '';

        if (isHostelMode) {
            contextText = Room.getCatalogText(storeId);
            customerHistory = Booking.getCustomerHistoryText(storeId, customerPhone);
        } else if (isClinicMode) {
            contextText = Product.getCatalogText(storeId);
            customerHistory = Appointment.getCustomerHistoryText(storeId, customerPhone);
            const Doctor = require('../models/Doctor');
            const doctors = Doctor.getByStoreId(storeId, true);
            if (doctors.length > 0) {
                const docsList = doctors.map(d => `- ${d.name} ${d.specialty ? `(${d.specialty})` : ''}`).join('\n');
                contextText += `\n\nDOCTORES/PROFESIONALES DISPONIBLES:\n${docsList}`;
            }
        } else {
            contextText = Product.getCatalogText(storeId);
            customerHistory = Order.getCustomerHistoryText(storeId, customerPhone);
        }

        // Obtener historial de conversación
        const conversationHistory = this._getConversationHistory(storeId, customerPhone);

        // System prompt con contexto del local, catálogo/servicios e historial del cliente
        const systemPrompt = this._buildSystemPrompt(store, contextText, customerHistory, isClinicMode, isHostelMode);

        // Construir mensajes para el modelo
        const messages = [
            new SystemMessage(systemPrompt),
            ...conversationHistory,
            new HumanMessage(message)
        ];

        const withTimeout = (promise, ms) => {
            let timeoutId;
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error('TIMEOUT_EXCEEDED')), ms);
            });
            return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
        };

        const sentImages = [];

        try {
            const MapsService = require('./maps');
            const calcularDistanciaTool = {
                type: 'function',
                function: {
                    name: 'calcular_distancia_km',
                    description: 'Calcula la distancia en kilómetros desde el local hasta la dirección del cliente. Úsala ANTES de confirmar el pedido si ya tienes la dirección.',
                    parameters: {
                        type: 'object',
                        properties: {
                            customerAddress: { type: 'string', description: 'Dirección o link proporcionado por el cliente.' }
                        },
                        required: ['customerAddress']
                    }
                }
            };

            const verificarDisponibilidadTool = {
                type: 'function',
                function: {
                    name: 'verificar_disponibilidad',
                    description: 'Verifica si hay turnos disponibles para una fecha específica. Úsala cuando el cliente quiera agendar una cita.',
                    parameters: {
                        type: 'object',
                        properties: {
                            date: { type: 'string', description: 'Fecha en formato YYYY-MM-DD (ej: 2025-01-15)' }
                        },
                        required: ['date']
                    }
                }
            };

            const verificarDisponibilidadHostelTool = {
                type: 'function',
                function: {
                    name: 'verificar_disponibilidad_hostel',
                    description: 'Verifica la disponibilidad y precios totales de habitaciones/camas del hostel para un rango de fechas. Úsala cuando el cliente quiera consultar o reservar alojamiento.',
                    parameters: {
                        type: 'object',
                        properties: {
                            checkInDate: { type: 'string', description: 'Fecha de ingreso en formato YYYY-MM-DD (ej: 2026-02-10)' },
                            checkOutDate: { type: 'string', description: 'Fecha de salida en formato YYYY-MM-DD (ej: 2026-02-14)' },
                            guestsCount: { type: 'number', description: 'Cantidad de huéspedes/personas' }
                        },
                        required: ['checkInDate', 'checkOutDate']
                    }
                }
            };

            const enviarFotoProductoTool = {
                type: 'function',
                function: {
                    name: 'enviar_foto_producto',
                    description: 'Envía una foto del producto al cliente por WhatsApp. Úsala SIEMPRE que el cliente pida ver, solicitar fotos o imágenes de un producto del catálogo.',
                    parameters: {
                        type: 'object',
                        properties: {
                            productName: { type: 'string', description: 'Nombre del producto solicitado' }
                        },
                        required: ['productName']
                    }
                }
            };

            const tools = isHostelMode 
                ? [verificarDisponibilidadHostelTool] 
                : (isClinicMode ? [verificarDisponibilidadTool] : [calcularDistanciaTool, enviarFotoProductoTool]);

            const modelWithTools = activeModel.bindTools(tools);
            let response = await withTimeout(modelWithTools.invoke(messages), 20000); // 20 segundos timeout

            // Bucle para manejar invocaciones de herramientas
            while (response.tool_calls && response.tool_calls.length > 0) {
                messages.push(response);
                
                for (const toolCall of response.tool_calls) {
                    if (toolCall.name === 'calcular_distancia_km') {
                        console.log(`🗺️ Calculando distancia para: ${toolCall.args.customerAddress}`);
                        const distance = await MapsService.calculateDistanceKm(storeId, toolCall.args.customerAddress);
                        
                        let toolContent = "Error al calcular distancia. Preguntale al usuario si está a más de 5km.";
                        if (distance !== null) {
                            toolContent = `La distancia es ${distance.toFixed(1)} km.`;
                        }
                        
                        messages.push(new ToolMessage({
                            tool_call_id: toolCall.id,
                            content: toolContent,
                            name: toolCall.name
                        }));
                    } else if (toolCall.name === 'verificar_disponibilidad') {
                        console.log(`📅 Verificando disponibilidad para: ${toolCall.args.date}`);
                        const slots = Appointment.getAvailableSlots(storeId, toolCall.args.date);
                        const availableSlots = slots.filter(s => s.available).map(s => s.time);
                        
                        let toolContent = `No hay horarios disponibles para el ${toolCall.args.date}.`;
                        if (availableSlots.length > 0) {
                            toolContent = `Horarios disponibles para el ${toolCall.args.date}: ${availableSlots.join(', ')}`;
                        }
                        
                        messages.push(new ToolMessage({
                            tool_call_id: toolCall.id,
                            content: toolContent,
                            name: toolCall.name
                        }));
                    } else if (toolCall.name === 'verificar_disponibilidad_hostel') {
                        console.log(`🏨 Verificando disponibilidad hostel: ${toolCall.args.checkInDate} al ${toolCall.args.checkOutDate}`);
                        const rooms = Booking.getAvailableRoomsForDates(
                            storeId,
                            toolCall.args.checkInDate,
                            toolCall.args.checkOutDate,
                            toolCall.args.guestsCount || 1
                        );
                        let toolContent = `Disponibilidad del ${toolCall.args.checkInDate} al ${toolCall.args.checkOutDate}:\n`;
                        rooms.forEach(r => {
                            if (r.is_available) {
                                toolContent += `- "${r.name}" (ID: ${r.id}): DISPONIBLE. Precio por noche: $${r.price_per_night}. Total por ${r.total_nights} noche(s): $${r.total_price}. Unidades/camas libres: ${r.available_units}.\n`;
                            } else {
                                toolContent += `- "${r.name}": NO DISPONIBLE para estas fechas o capacidad (${r.capacity} pax max).\n`;
                            }
                        });

                        messages.push(new ToolMessage({
                            tool_call_id: toolCall.id,
                            content: toolContent,
                            name: toolCall.name
                        }));
                    } else if (toolCall.name === 'enviar_foto_producto') {
                        console.log(`🖼️ Intentando enviar foto del producto: ${toolCall.args.productName} a ${customerPhone}`);
                        const fs = require('fs');
                        const path = require('path');
                        const WhatsAppManager = require('./whatsapp');
                        const products = Product.getByStoreId(storeId, true);
                        const searchName = (toolCall.args.productName || '').toLowerCase().trim();
                        const product = products.find(p => p.name.toLowerCase().includes(searchName) || searchName.includes(p.name.toLowerCase()));
                        
                        let toolContent = `No encontré el producto "${toolCall.args.productName}" en el catálogo.`;
                        if (product) {
                            if (product.image_path) {
                                try {
                                    const filename = path.basename(product.image_path);
                                    const fullPath = path.join(__dirname, '..', '..', 'data', 'media', filename);
                                    if (fs.existsSync(fullPath)) {
                                        const imgBuffer = fs.readFileSync(fullPath);
                                        await WhatsAppManager.sendImageMessage(customerPhone, imgBuffer, `📷 ${product.name} — $${product.price}`, storeId);
                                        sentImages.push({
                                            url: `/media/${filename}`,
                                            productName: product.name,
                                            price: product.price,
                                            caption: `📷 ${product.name} — $${product.price}`
                                        });
                                        toolContent = `Foto del producto "${product.name}" enviada exitosamente por WhatsApp al cliente. Informale de forma amigable que ya se la enviaste.`;
                                    } else {
                                        toolContent = `El producto "${product.name}" tiene registrada una imagen pero el archivo no existe en el servidor.`;
                                    }
                                } catch (err) {
                                    console.error("Error enviando foto por WhatsApp:", err.message);
                                    toolContent = `Error al enviar la foto por WhatsApp: ${err.message}`;
                                }
                            } else {
                                toolContent = `El producto "${product.name}" no tiene foto disponible cargada en el sistema.`;
                            }
                        }

                        messages.push(new ToolMessage({
                            tool_call_id: toolCall.id,
                            content: toolContent,
                            name: toolCall.name
                        }));
                    }
                }
                
                response = await withTimeout(modelWithTools.invoke(messages), 20000);
            }

            const elapsedMs = Date.now() - startTime;
            if (elapsedMs > 5000) {
                console.warn(`⚠️ [IA Latency Alert] Respuesta de IA demoró ${elapsedMs}ms (>5s) | Tienda: ${storeId} | Proveedor: ${requestedProvider}`);
            } else {
                console.log(`🧠 [IA Telemetry] Respuesta generada en ${elapsedMs}ms | Tienda: ${storeId} | Proveedor: ${requestedProvider}`);
            }

            const aiResponse = response.content;

            // Guardar en historial de conversación
            this._saveToConversation(storeId, customerPhone, message, aiResponse);

            // Intentar extraer JSON de pedido, cita, reserva o derivación humana
            const extractedData = this._extractData(aiResponse, isClinicMode, isHostelMode);

            if (extractedData) {
                if (extractedData.es_spam) {
                    return {
                        response: extractedData.mensaje_confirmacion || aiResponse,
                        order: null,
                        appointment: null,
                        booking: null,
                        requiere_humano: false,
                        es_spam: true,
                        images: sentImages
                    };
                }

                if (extractedData.requiere_humano) {
                    return {
                        response: extractedData.mensaje_confirmacion || aiResponse,
                        order: null,
                        appointment: null,
                        booking: null,
                        requiere_humano: true,
                        es_spam: false,
                        images: sentImages
                    };
                }

                if (isHostelMode && (extractedData.reserva_completa || extractedData.booking_complete)) {
                    this._completeConversation(storeId, customerPhone);
                    return {
                        response: extractedData.mensaje_confirmacion || aiResponse,
                        order: null,
                        appointment: null,
                        booking: extractedData,
                        requiere_humano: false,
                        images: sentImages
                    };
                } else if (isClinicMode && extractedData.cita_completa) {
                    this._completeConversation(storeId, customerPhone);
                    return {
                        response: extractedData.mensaje_confirmacion || aiResponse,
                        order: null,
                        appointment: extractedData,
                        booking: null,
                        requiere_humano: false,
                        images: sentImages
                    };
                } else if (!isClinicMode && !isHostelMode && extractedData.pedido_completo) {
                    this._completeConversation(storeId, customerPhone);
                    return {
                        response: extractedData.mensaje_confirmacion || aiResponse,
                        order: extractedData,
                        appointment: null,
                        booking: null,
                        requiere_humano: false,
                        images: sentImages
                    };
                }
            }

            return {
                response: aiResponse,
                order: null,
                appointment: null,
                booking: null,
                requiere_humano: false,
                images: sentImages
            };
        } catch (error) {
            const elapsedMs = Date.now() - startTime;
            console.error(`❌ [IA Error] Error en LangChain tras ${elapsedMs}ms (${requestedProvider}):`, error.message);
            const fallbackMsg = error.message === 'TIMEOUT_EXCEEDED' 
                ? '⏳ En este momento estoy un poco saturado y no pude procesar tu mensaje. Por favor, intentá de nuevo en unos segundos. 🙏'
                : '¡Disculpá! Tuve un problema técnico procesando tu mensaje. ¿Podés intentar de nuevo? 🙏';
            
            return {
                response: fallbackMsg,
                order: null,
                appointment: null,
                booking: null,
                requiere_humano: false,
                images: sentImages
            };
        }
    }

    /**
     * Construir el system prompt con catálogo/servicios/habitaciones, reglas e historial del local.
     */
    _buildSystemPrompt(store, contextText, customerHistory = '', isClinicMode = false, isHostelMode = false) {
        const botName = store.bot_name || 'Bot';
        const businessName = store.name || 'el negocio';
        const businessType = store.business_type || 'negocio';
        const customPrompt = store.ai_prompt ? `\nINSTRUCCIONES Y REGLAS DE NEGOCIO PARTICULARES:\n${store.ai_prompt}\n` : '';

        if (isHostelMode) {
            return this._buildHostelPrompt(store, contextText, customerHistory, botName, businessName, customPrompt);
        }

        if (isClinicMode) {
            return this._buildClinicPrompt(store, contextText, customerHistory, botName, businessName, customPrompt);
        }

        return this._buildStorePrompt(store, contextText, customerHistory, botName, businessName, businessType, customPrompt);
    }

    /**
     * Prompt para modo tienda (original).
     */
    _buildStorePrompt(store, catalog, customerHistory, botName, businessName, businessType, customPrompt) {
        return `Sos ${botName}, un asistente virtual de un ${businessType} llamado "${businessName}". Tu trabajo es atender clientes por WhatsApp de manera natural, amigable y eficiente.

REGLAS IMPORTANTES:
1. DETECCIÓN DE IDIOMA MULTILINGÜE: Detectá automáticamente el idioma del cliente (Español, Inglés 'English', o Portugués 'Português'). Respondé SIEMPRE en el mismo idioma en el que te escribe el cliente con amabilidad y naturalidad.
2. Sé conciso y amigable. Usá emojis con moderación.
3. Solo podés vender los productos del catálogo. Si piden algo que no existe, sugerí alternativas.
4. Para completar un pedido necesitás: **nombre del cliente** + productos + dirección de entrega (o datos de retiro) + método de pago.
   - El nombre es OBLIGATORIO para saber a quién le entrega el repartidor. Pedílo de forma natural si no lo sabés (ej: "¿Me decís tu nombre para el pedido?").
   - Si ya sabés el nombre del cliente (por el contexto de la charla o el historial), no lo vuelvas a pedir.
5. Antes de cerrar el pedido, preguntale al cliente si desea modificar algo o agregar algún detalle.
6. Para la dirección, aceptá ubicaciones de WhatsApp o Google Maps, o direcciones escritas.
7. **LÍMITE DE ENVÍO Y COSTOS**: Si el cliente te da la dirección, USA LA HERRAMIENTA 'calcular_distancia_km' para saber a cuántos kilómetros está ANTES de cerrar el pedido.
IMPORTANTE: Si en el historial de chat ya le avisaste que hubo un error al calcular la distancia, o ya le preguntaste manualmente si está a más de 5km, NO VUELVAS A USAR LA HERRAMIENTA. Acepta la respuesta del cliente y continúa.
Si la herramienta indica que está a más de 5km (o el cliente lo confirma), adviertele que el envío tiene un costo extra y SUMALO al total. Si está a menos de 5km, el envío es gratis.
8. Los métodos de pago aceptados son: Efectivo, Débito (llevamos POS), Mercado Pago y Transferencia.
9. Si falta información, preguntá de forma natural (no como formulario).
10. **IMÁGENES**: Si el contexto indica que el cliente envió una imagen, analizá la descripción proporcionada. Si parece un producto del catálogo, ofrecelo. Si es una foto de un plato/plato que quieren, describilo y ofrecé alternativas similares de tu catálogo.
${customPrompt}

${catalog}

---
CONTEXTO DE ESTE CLIENTE:
${customerHistory}
* REGLA: Si el cliente es recurrente (tiene compras previas) y saluda o hace un pedido genérico, podés saludarlo reconociéndolo amigablemente (ej: "¡Hola de nuevo! ¿Cómo andás? ¿Querés repetir el pedido de la otra vez?") y agilizar la venta.

---
CUANDO EL PEDIDO ESTÉ COMPLETO (tenés productos, dirección y método de pago), respondé con un mensaje de confirmación natural Y además incluí al final un bloque JSON con el formato exacto:

\`\`\`json
{
  "pedido_completo": true,
  "nombre_cliente": "nombre que te dio el cliente",
  "items": [{"producto": "nombre exacto del catálogo", "cantidad": 1, "detalles": "observaciones del item", "precio_unitario": 000}],
  "direccion": "dirección completa",
  "metodo_pago": "método elegido",
  "notas": "notas generales del pedido o delivery",
  "mensaje_confirmacion": "tu mensaje de confirmación amigable al cliente"
}
\`\`\`

SI EL CLIENTE REQUIERE ATENCIÓN HUMANA (pide hablar con una persona, tiene dudas complejas, quiere hacer un reclamo, o está enojado), respondé amigablemente y retorná este JSON exacto:

\`\`\`json
{
  "requiere_humano": true,
  "mensaje_confirmacion": "Entendido. Enseguida te comunico con uno de mis compañeros para que te atienda personalmente."
}
\`\`\`

SI EL CLIENTE ES UN TROLL (hace bromas pesadas, insulta, pide cosas absurdas reiteradamente o dice cosas sin sentido), cortá la charla y respondé con este JSON exacto:

\`\`\`json
{
  "es_spam": true,
  "mensaje_confirmacion": "Por favor, hagamos un buen uso del bot. Solo estoy aquí para tomar pedidos del local."
}
\`\`\`

IMPORTANTE: El JSON de pedido solo debe aparecer cuando el pedido esté 100% completo. Si falta algo, simplemente preguntá.
Si el cliente solo quiere consultar precios o el menú, respondé naturalmente sin JSON.`;
    }

    /**
     * Prompt para modo clínica (citas).
     */
    _buildClinicPrompt(store, servicesText, customerHistory, botName, businessName, customPrompt) {
        const workingHours = store.working_hours || '08:00-20:00';
        const slotDuration = store.slot_duration || 30;

        return `Sos ${botName}, un asistente virtual de "${businessName}". Tu trabajo es atender pacientes/clientes por WhatsApp para agendar citas de manera natural, amigable y eficiente.

REGLAS IMPORTANTES:
1. Respondé siempre en español rioplatense (vos, tenés, querés).
2. Sé conciso y amigable. Usá emojis con moderación.
3. Solo podés agendar los servicios del catálogo. Si piden algo que no existe, sugerí alternativas.
4. Para completar una cita necesitás: **nombre del paciente** + servicio + fecha + hora.
   - El nombre es OBLIGATORIO. Pedílo de forma natural si no lo sabés.
   - Si ya sabés el nombre del cliente (por el contexto o historial), no lo vuelvas a pedir.
   - Si hay doctores/profesionales disponibles, preguntá amablemente si tiene preferencia por alguno o si prefiere cualquiera.
5. Horario de atención: ${workingHours}. Cada turno dura ${slotDuration} minutos.
6. ANTES de confirmar la cita, USA LA HERRAMIENTA 'verificar_disponibilidad' para verificar horarios disponibles para la fecha que el paciente elija.
7. Si el paciente quiere una hora que no está disponible, ofrecé alternativas de las horas que sí están libres.
8. Para fechas, aceptá tanto "el lunes", "mañana", "el 15 de enero" como fechas en formato numérico.
9. Si falta información, preguntá de forma natural (no como formulario).
10. Podés preguntar por motivos de consulta o notas adicionales para la cita, pero es opcional.
${customPrompt}

SERVICIOS DISPONIBLES:
${servicesText}

---
CONTEXTO DE ESTE PACIENTE/CLIENTE:
${customerHistory}
* REGLA: Si el cliente es recurrente, podés saludarlo reconociéndolo amigablemente.

---
CUANDO LA CITA ESTÉ COMPLETA (tenés nombre, servicio, fecha, hora y preferencia de doctor), respondé con un mensaje de confirmación natural Y además incluí al final un bloque JSON con el formato exacto:

\`\`\`json
{
  "cita_completa": true,
  "nombre_cliente": "nombre que te dio el paciente",
  "servicio": "nombre exacto del servicio",
  "doctor": "nombre del doctor elegido, o null si no tiene preferencia",
  "fecha": "YYYY-MM-DD",
  "hora": "HH:MM",
  "duracion": 30,
  "precio": 0,
  "notas": "motivo de consulta u observaciones",
  "mensaje_confirmacion": "tu mensaje de confirmación amigable al paciente"
}
\`\`\`

SI EL CLIENTE REQUIERE ATENCIÓN HUMANA (pide hablar con una persona, tiene dudas complejas, quiere hacer un reclamo, o está enojado), respondé amigablemente y retorná este JSON exacto:

\`\`\`json
{
  "requiere_humano": true,
  "mensaje_confirmacion": "Entendido. Enseguida te comunico con uno de mis compañeros para que te atienda personalmente."
}
\`\`\`

SI EL CLIENTE ES UN TROLL (hace bromas pesadas, insulta, pide cosas absurdas reiteradamente o dice cosas sin sentido), cortá la charla y respondé con este JSON exacto:

\`\`\`json
{
  "es_spam": true,
  "mensaje_confirmacion": "Por favor, hagamos un buen uso del bot. Solo estoy aquí para agendar citas."
}
\`\`\`

IMPORTANTE: El JSON de cita solo debe aparecer cuando la cita esté 100% completa. Si falta algo, simplemente preguntá.
Si el cliente solo quiere consultar precios o servicios, respondé naturalmente sin JSON.`;
    }


    /**
     * Obtener historial de conversación activa con un cliente.
     */
    _getConversationHistory(storeId, customerPhone) {
        const db = getDb();
        const conv = db.prepare(`
            SELECT messages FROM conversations 
            WHERE store_id = ? AND customer_phone = ? AND status = 'active'
            ORDER BY updated_at DESC LIMIT 1
        `).get(storeId, customerPhone);

        if (!conv) return [];

        try {
            const messages = JSON.parse(conv.messages);
            return messages.map(m => {
                if (m.role === 'human') return new HumanMessage(m.content);
                return new AIMessage(m.content);
            });
        } catch {
            return [];
        }
    }

    /**
     * Guardar mensajes en el historial de conversación.
     */
    _saveToConversation(storeId, customerPhone, humanMsg, aiMsg) {
        const db = getDb();

        const existing = db.prepare(`
            SELECT id, messages FROM conversations 
            WHERE store_id = ? AND customer_phone = ? AND status = 'active'
            ORDER BY updated_at DESC LIMIT 1
        `).get(storeId, customerPhone);

        const newMessages = [
            { role: 'human', content: humanMsg },
            { role: 'ai', content: aiMsg }
        ];

        if (existing) {
            const messages = JSON.parse(existing.messages);
            messages.push(...newMessages);

            // Mantener solo los últimos 20 mensajes para no exceder tokens
            const trimmed = messages.slice(-20);

            db.prepare(`
                UPDATE conversations 
                SET messages = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(JSON.stringify(trimmed), existing.id);
        } else {
            db.prepare(`
                INSERT INTO conversations (store_id, customer_phone, messages)
                VALUES (?, ?, ?)
            `).run(storeId, customerPhone, JSON.stringify(newMessages));
        }
    }

    /**
     * Marcar conversación como completada (pedido realizado).
     */
    _completeConversation(storeId, customerPhone) {
        const db = getDb();
        db.prepare(`
            UPDATE conversations 
            SET status = 'completed', updated_at = CURRENT_TIMESTAMP
            WHERE store_id = ? AND customer_phone = ? AND status = 'active'
        `).run(storeId, customerPhone);
    }

    /**
     * Prompt para modo hostel (alojamiento/reservas).
     */
    _buildHostelPrompt(store, roomsText, customerHistory, botName, businessName, customPrompt) {
        return `Sos ${botName}, el recepcionista virtual de "${businessName}". Tu trabajo es atender viajeros y huéspedes por WhatsApp de manera cálida, hospitalaria, servicial y eficiente.

REGLAS IMPORTANTES:
1. Podés responder en español rioplatense (amigable y cercano) o en el idioma en que te hable el viajero (inglés, portugués, etc.).
2. Sé servicial y claro. Brindá respuesta rápida a dudas sobre check-in/check-out, clave WiFi, ubicación, transporte y normas del hostel.
3. Para consultar o realizar una reserva, USA SIEMPRE la herramienta 'verificar_disponibilidad_hostel' ingresando la fecha de check-in, check-out y número de huéspedes.
4. Para completar una reserva necesitás:
   - **Nombre completo del huésped**
   - Fecha de ingreso (Check-in)
   - Fecha de salida (Check-out)
   - Cantidad de huéspedes
   - Opción de habitación elegida (tipo/nombre de la habitación)
   - Método de pago (Efectivo, Transferencia, Tarjeta/MercadoPago)
5. Informá claramente el número de noches y el precio total estimado de la estadía.
6. Si falta información, pedíla de forma natural y amable.
${customPrompt}

OPCIONES DE ALOJAMIENTO DISPONIBLES:
${roomsText}

---
HISTORIAL DE ESTE HUÉSPED:
${customerHistory}
* REGLA: Si el huésped ya tiene reservas previas, podés saludarlo reconociéndolo afectuosamente.

---
CUANDO LA RESERVA ESTÉ COMPLETA (tenés nombre, check-in, check-out, huéspedes, habitación elegida y método de pago), respondé con un mensaje de confirmación hospitalario Y además incluí al final un bloque JSON con el formato exacto:

\`\`\`json
{
  "reserva_completa": true,
  "nombre_cliente": "nombre completo del huésped",
  "tipo_habitacion": "nombre exacto de la habitación o dorm elegido",
  "room_id": 1,
  "check_in": "YYYY-MM-DD",
  "check_out": "YYYY-MM-DD",
  "huespedes": 1,
  "precio_total": 150,
  "metodo_pago": "Efectivo",
  "notas": "observaciones del huésped",
  "mensaje_confirmacion": "tu mensaje de confirmación hospitalario al huésped"
}
\`\`\`

SI EL HUÉSPED REQUIERE ATENCIÓN HUMANA (pide hablar con recepción, tiene dudas complejas sobre traslados o grupos grandes), respondé amigablemente y retorná este JSON exacto:

\`\`\`json
{
  "requiere_humano": true,
  "mensaje_confirmacion": "Entendido. Enseguida le aviso a la recepción para que te atienda personalmente."
}
\`\`\`

SI EL USUARIO ES UN TROLL O HACE SPAM, respondé cortésmente y retorná:

\`\`\`json
{
  "es_spam": true,
  "mensaje_confirmacion": "Por favor, hagamos un buen uso del bot de recepción. Estoy para asistirte con tu estadía."
}
\`\`\`

IMPORTANTE: El JSON de reserva solo debe aparecer cuando la reserva esté 100% completa. Si el cliente solo está consultando disponibilidad o precios, respondé naturalmente usando la información de la herramienta.`;
    }

    /**
     * Extraer datos del pedido, cita o reserva del JSON embebido en la respuesta del modelo.
     */
    _extractData(aiResponse, isClinicMode = false, isHostelMode = false) {
        try {
            const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/);
            if (!jsonMatch) return null;

            const data = JSON.parse(jsonMatch[1]);
            
            if (isHostelMode) {
                if (!data.reserva_completa && !data.booking_complete && !data.requiere_humano && !data.es_spam) return null;
            } else if (isClinicMode) {
                if (!data.cita_completa && !data.requiere_humano && !data.es_spam) return null;
            } else {
                if (!data.pedido_completo && !data.requiere_humano && !data.es_spam) return null;
            }

            return data;
        } catch {
            return null;
        }
    }
}

// Singleton
let instance = null;

function getLangChainService() {
    if (!instance) {
        instance = new LangChainService();
    }
    return instance;
}

module.exports = { getLangChainService };

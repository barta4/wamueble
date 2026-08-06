const fs = require('fs');
const path = require('path');
const pino = require('pino');
const WhatsappProvider = require('./WhatsappProvider');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    downloadMediaMessage,
    Browsers
} = require('baileys');

class BaileysProvider extends WhatsappProvider {
    constructor(connectionId, storeId) {
        super();
        this.connectionId = connectionId || 'global';
        this.storeId = storeId;
        this.sock = null;
        this.io = null;
        this.sessionDir = `./auth_info_baileys_conn_${this.connectionId}`;
        this.reconnectAttempts = 0;
        this.messageQueue = [];
        this.isProcessingQueue = false;
    }

    async initialize(io, force = false) {
        this.io = io;
        
        // Solo iniciar conexión automáticamente si ya existe una sesión guardada o si se fuerza (ej. para QR)
        const credsPath = path.join(this.sessionDir, 'creds.json');
        if (fs.existsSync(credsPath) || force) {
            if (force && !fs.existsSync(credsPath)) {
                console.log(`🔄 Forzando inicio de conexión ${this.connectionId} para generar QR...`);
            } else {
                console.log(`🔑 Sesión de WhatsApp (Baileys) encontrada para ${this.connectionId}, conectando automáticamente...`);
            }
            await this._startConnection();
        } else {
            console.log(`📱 No se encontró sesión de WhatsApp (Baileys) para ${this.connectionId}. Esperando inicio manual desde el panel.`);
        }
    }

    async _startConnection() {
        const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);

        this.sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'info' }),
            browser: Browsers.ubuntu('Chrome') // Anti-ban: Simular que somos Chrome en Ubuntu, no 'Baileys'
        });

        // Persistir credenciales cada vez que cambian (OBLIGATORIO)
        this.sock.ev.on('creds.update', saveCreds);

        // Manejar cambios de conexión
        this.sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            // Enviar QR al panel admin
            if (qr && this.io) {
                console.log(`📱 Nuevo QR generado para conexión ${this.connectionId}, enviando al panel...`);
                this.io.to('admin').emit('whatsapp-qr', { connectionId: this.connectionId, qr });
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                console.log(
                    `❌ Conexión cerrada para conexión ${this.connectionId}.`,
                    'Razón:', lastDisconnect?.error?.message || 'desconocida',
                    '| Código:', statusCode,
                    '| Reconectar:', shouldReconnect
                );

                if (this.io) {
                    this.io.to('admin').emit('whatsapp-status', {
                        connectionId: this.connectionId,
                        status: 'disconnected',
                        reason: lastDisconnect?.error?.message
                    });
                }

                if (shouldReconnect) {
                    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 60000);
                    console.log(`🔄 Reintentando conectar conexión ${this.connectionId} en ${delay/1000}s... (Intento ${this.reconnectAttempts + 1})`);
                    this.reconnectAttempts++;
                    setTimeout(() => this._startConnection(), delay);
                } else {
                    console.log(`🗑️ Sesión invalidada (logout) para conexión ${this.connectionId}. Limpiando credenciales...`);
                    fs.rmSync(this.sessionDir, { recursive: true, force: true });
                }
            } else if (connection === 'open') {
                console.log(`✅ WhatsApp conectado correctamente para conexión ${this.connectionId}`);
                this.reconnectAttempts = 0; // Resetear backoff
                if (this.io) {
                    this.io.to('admin').emit('whatsapp-status', { connectionId: this.connectionId, status: 'connected' });
                }
                // Rotar presencia a offline por defecto
                if (this.sock) {
                    this.sock.sendPresenceUpdate('unavailable').catch(()=>{});
                }
            }
        });

        // Escuchar mensajes entrantes (API v7: destructuring { messages })
        this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
            // Solo procesar notificaciones nuevas, no historial
            if (type !== 'notify') return;

            for (const msg of messages) {
                if (!msg.key.fromMe && msg.message) {
                    // Confirmación de lectura con delay simulado
                    setTimeout(async () => {
                        try {
                            if (this.sock) {
                                await this.sock.sendPresenceUpdate('available', msg.key.remoteJid);
                                await this.sock.readMessages([msg.key]);
                            }
                        } catch(e) {
                            console.warn("⚠️ No se pudo marcar el mensaje como leído", e.message);
                        }
                    }, Math.floor(Math.random() * 2000) + 1500); // Delay entre 1.5s y 3.5s

                    await this._handleIncomingMessage(msg);
                }
            }
        });
    }

    async requestPairingCode(phoneNumber) {
        if (!this.sock) {
            console.log('🔄 Iniciando conexión a WhatsApp para solicitar Pairing Code...');
            await this._startConnection();
            // Esperar un momento a que el socket de baileys esté listo para recibir peticiones
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        if (this.sock.authState?.creds?.me) throw new Error("Ya estás conectado.");
        const code = await this.sock.requestPairingCode(phoneNumber);
        return code;
    }

    async _handleIncomingMessage(msg) {
        const messageProcessor = require('../messageProcessor');
        await messageProcessor.processBaileysMessage(msg, this);
    }

    // Variación para evitar hashes idénticos en textos repetitivos
    _addVariation(text) {
        const invisibleSpaces = ['\u200B', '\u200C', '\u200D', '\uFEFF'];
        const count = Math.floor(Math.random() * 3); // 0 a 2 caracteres invisibles
        let variations = '';
        for (let i = 0; i < count; i++) {
            variations += invisibleSpaces[Math.floor(Math.random() * invisibleSpaces.length)];
        }
        return text + variations;
    }

    async sendTextMessage(phone, text) {
        return new Promise((resolve, reject) => {
            this.messageQueue.push({ phone, text, resolve, reject });
            this._processQueue();
        });
    }

    async _processQueue() {
        if (this.isProcessingQueue) return;
        this.isProcessingQueue = true;

        while (this.messageQueue.length > 0) {
            const { phone, text, resolve, reject } = this.messageQueue[0];
            try {
                await this._executeSend(phone, text);
                resolve();
            } catch (err) {
                console.error("❌ Error en cola de envío:", err);
                reject(err);
            }
            this.messageQueue.shift();
            // Rate limit: pausa de ~3 segundos entre mensajes para simular límite global de max ~20 por minuto
            await new Promise(r => setTimeout(r, 3000));
        }

        this.isProcessingQueue = false;
    }

    async _executeSend(phone, text) {
        if (!this.sock) throw new Error("Baileys not initialized");
        
        let jid = phone;
        if (jid.startsWith('+')) jid = jid.substring(1);
        
        // Si no tiene dominio, asumimos que es un número normal y lo formateamos
        if (!jid.includes('@')) {
            jid = `${this._formatPhone(jid)}@s.whatsapp.net`;
        }

        try {
            // 1. Despertar / Conectarse (Available)
            await this.sock.sendPresenceUpdate('available', jid);
            await new Promise(resolve => setTimeout(resolve, 500));

            // 2. Simular que el bot está "escribiendo..."
            await this.sock.sendPresenceUpdate('composing', jid);

            // 3. Esperar un tiempo proporcional al tamaño del mensaje para parecer humano (entre 1.5s y 4s)
            const delayMs = Math.min(Math.max(text.length * 30, 1500), 4000);
            await new Promise(resolve => setTimeout(resolve, delayMs));

            // 4. Pausar estado y enviar el mensaje
            await this.sock.sendPresenceUpdate('paused', jid);
            await this.sock.sendMessage(jid, { text });
            
            console.log(`📤 Mensaje enviado a ${jid}`);
        } finally {
            // Rotar a offline después de enviar (con pequeño delay para que parezca natural)
            setTimeout(() => {
                if (this.sock) {
                    this.sock.sendPresenceUpdate('unavailable', jid).catch(()=>{});
                }
            }, 3000);
        }
    }

    async sendOrderConfirmation(phone, orderData) {
        const itemsList = orderData.items
            .map(item => {
                let line = `${item.quantity}x ${item.product_name}`;
                if (item.details) line += ` (${item.details})`;
                return line;
            })
            .join('\n');

        const message = this._addVariation(`✅ *¡Pedido recibido!* (N° ${orderData.order_number})\n\n` +
            `${itemsList}\n\n` +
            `📍 Entrega: ${orderData.address}\n` +
            `💰 Total: $${orderData.total}\n` +
            `💳 Pago: ${orderData.payment_method}\n\n` +
            `⏱ Enseguida marcha. Te avisamos cuando esté listo.`);

        return this.sendTextMessage(phone, message);
    }

    async sendAppointmentConfirmation(phone, appointment, storeName = 'Clínica') {
        const message = this._addVariation(`✅ ¡Cita confirmada!\n\n` +
            `📋 Servicio: ${appointment.service}\n` +
            `📅 Fecha: ${new Date(appointment.date).toLocaleDateString('es-UY')}\n` +
            `🕐 Hora: ${appointment.time}\n` +
            `👤 Paciente: ${appointment.customer_name}\n` +
            `${appointment.doctor ? `👨‍⚕️ Profesional: ${appointment.doctor}\n` : ''}` +
            `\nSi necesitás cancelar o reagendar, avisame. ¡Te esperamos! 😊`);
        
        await this.sendTextMessage(phone, message);
    }

    async notifyDelivery(order, driverPhone) {
        if (!driverPhone) {
            console.warn('⚠️ No se proporcionó número de repartidor');
            return;
        }

        const itemsList = order.items
            .map(item => {
                let line = `${item.quantity}x ${item.product_name}`;
                if (item.details) line += ` (${item.details})`;
                return line;
            })
            .join(', ');

        const mapsLink = this._generateMapsLink(order.address);
        const customerNameStr = order.customer_name ? `👤 Cliente: ${order.customer_name}\n` : '';

        const message = this._addVariation(`🍕 *Pedido listo para retirar* (N° ${order.order_number})\n\n` +
            customerNameStr +
            `📦 ${itemsList}\n\n` +
            `📍 Entregar en: ${order.address}\n` +
            `💰 Paga con: ${order.payment_method}\n` +
            `🗺 Ubicación: ${mapsLink}`);

        return this.sendTextMessage(driverPhone, message);
    }

    async notifyCustomerReady(phone, orderNumber) {
        const message = this._addVariation(`🚀 *¡Tu pedido N° ${orderNumber} está en camino!*\n\n` +
            `El repartidor ya salió con tu pedido. ¡Buen provecho! 🍕`);
        return this.sendTextMessage(phone, message);
    }

    async downloadMedia(messageId, metadata) {
        const buffer = await downloadMediaMessage(
            metadata.msg,
            'buffer',
            {},
            {
                logger: pino({ level: 'silent' }),
                reuploadRequest: this.sock.updateMediaMessage
            }
        );
        return buffer.toString('base64');
    }

    async _sendWithPresence(phone, messagePayload, logMsg, composingDelay = 1500) {
        if (!this.sock) throw new Error("Baileys not initialized");
        
        let jid = phone;
        if (jid.startsWith('+')) jid = jid.substring(1);
        if (!jid.includes('@')) {
            jid = `${this._formatPhone(jid)}@s.whatsapp.net`;
        }

        try {
            await this.sock.sendPresenceUpdate('available', jid);
            await new Promise(resolve => setTimeout(resolve, 500));
            await this.sock.sendPresenceUpdate('composing', jid);
            await new Promise(resolve => setTimeout(resolve, composingDelay));
            await this.sock.sendPresenceUpdate('paused', jid);
            
            await this.sock.sendMessage(jid, messagePayload);
            if (logMsg) console.log(logMsg(jid));
        } finally {
            setTimeout(() => {
                if (this.sock) {
                    this.sock.sendPresenceUpdate('unavailable', jid).catch(()=>{});
                }
            }, 3000);
        }
    }

    /**
     * Enviar imagen con caption.
     */
    async sendImageMessage(phone, imageBuffer, caption = '') {
        return this._sendWithPresence(
            phone,
            { image: imageBuffer, caption },
            (jid) => `📤 Imagen enviada a ${jid}`,
            1500
        );
    }

    /**
     * Enviar video con caption.
     */
    async sendVideoMessage(phone, videoBuffer, caption = '') {
        return this._sendWithPresence(
            phone,
            { video: videoBuffer, caption },
            (jid) => `📤 Video enviado a ${jid}`,
            2000
        );
    }

    /**
     * Enviar documento/archivo.
     */
    async sendDocumentMessage(phone, docBuffer, filename, caption = '') {
        return this._sendWithPresence(
            phone,
            { 
                document: docBuffer,
                fileName: filename,
                mimetype: this._getMimeType(filename),
                caption: caption
            },
            (jid) => `📤 Documento enviado a ${jid}: ${filename}`,
            1500
        );
    }

    /**
     * Determinar mimetype por extensión del archivo.
     */
    _getMimeType(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const mimeTypes = {
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'mp4': 'video/mp4',
            'mp3': 'audio/mpeg',
            'ogg': 'audio/ogg',
            'wav': 'audio/wav'
        };
        return mimeTypes[ext] || 'application/octet-stream';
    }
}

module.exports = BaileysProvider;

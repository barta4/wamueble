const axios = require('axios');
const WhatsappProvider = require('./WhatsappProvider');
const db = require('../../config/db').getDb();

class MetaCloudProvider extends WhatsappProvider {
    constructor(connectionId, storeId) {
        super();
        this.connectionId = connectionId || 'global';
        this.storeId = storeId;
        this.io = null;
        this.accessToken = '';
        this.phoneNumberId = '';
    }

    async initialize(io) {
        this.io = io;
        this._loadSettings();
        if (this.io) {
            this.io.to('admin').emit('whatsapp-status', { connectionId: this.connectionId, status: 'connected', mode: 'meta' });
        }
        console.log(`✅ Meta Cloud API Provider Initialized (Connection: ${this.connectionId})`);
    }

    _loadSettings() {
        const conn = db.prepare("SELECT * FROM whatsapp_connections WHERE id = ?").get(this.connectionId);
        this.accessToken = conn ? conn.meta_access_token : '';
        this.phoneNumberId = conn ? conn.meta_phone_id : '';
    }

    async sendTextMessage(phone, text) {
        if (!this.accessToken || !this.phoneNumberId) {
            this._loadSettings();
            if (!this.accessToken) throw new Error("Meta Cloud API no configurada correctamente.");
        }

        const url = `https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`;
        
        try {
            await axios.post(url, {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: this._formatPhone(phone),
                type: "text",
                text: { preview_url: false, body: text }
            }, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`📤 Mensaje enviado a ${phone} via Meta Cloud`);
        } catch (error) {
            console.error(`❌ Error enviando mensaje via Meta:`, error.response ? error.response.data : error.message);
            throw error;
        }
    }

    /**
     * Sincronizar plantillas aprobadas (APPROVED HSMs) desde Meta Cloud API.
     */
    async fetchTemplates() {
        if (!this.accessToken || !this.phoneNumberId) {
            this._loadSettings();
            if (!this.accessToken) return [];
        }

        const conn = db.prepare("SELECT meta_phone_id FROM whatsapp_connections WHERE id = ?").get(this.connectionId);
        const wabaId = (conn && conn.meta_phone_id) ? conn.meta_phone_id : this.phoneNumberId;
        const url = `https://graph.facebook.com/v19.0/${wabaId}/message_templates`;

        try {
            const response = await axios.get(url, {
                headers: { 'Authorization': `Bearer ${this.accessToken}` }
            });
            const templates = response.data.data || [];
            return templates.filter(t => t.status === 'APPROVED');
        } catch (error) {
            console.error(`❌ Error sincronizando plantillas de Meta:`, error.response ? error.response.data : error.message);
            return [];
        }
    }

    /**
     * Enviar mensaje de plantilla oficial (HSM) a un destinatario.
     */
    async sendTemplateMessage(phone, templateName, languageCode = 'es', parameters = []) {
        if (!this.accessToken || !this.phoneNumberId) {
            this._loadSettings();
            if (!this.accessToken) throw new Error("Meta Cloud API no configurada.");
        }

        const url = `https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`;
        
        const payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: this._formatPhone(phone),
            type: "template",
            template: {
                name: templateName,
                language: { code: languageCode },
                components: parameters.length > 0 ? [{
                    type: "body",
                    parameters: parameters.map(val => ({ type: "text", text: String(val) }))
                }] : []
            }
        };

        try {
            await axios.post(url, payload, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`📤 Plantilla oficial Meta "${templateName}" enviada a ${phone}`);
            return { success: true };
        } catch (error) {
            console.error(`❌ Error enviando plantilla Meta "${templateName}":`, error.response ? error.response.data : error.message);
            throw error;
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

        const message = `✅ *¡Pedido recibido!* (N° ${orderData.order_number})\n\n` +
            `${itemsList}\n\n` +
            `📍 Entrega: ${orderData.address}\n` +
            `💰 Total: $${orderData.total}\n` +
            `💳 Pago: ${orderData.payment_method}\n\n` +
            `⏱ Enseguida marcha. Te avisamos cuando esté listo.`;

        return this.sendTextMessage(phone, message);
    }

    async sendAppointmentConfirmation(phone, appointment) {
        const message = `✅ ¡Cita confirmada!\n\n` +
            `📋 Servicio: ${appointment.service}\n` +
            `📅 Fecha: ${new Date(appointment.date).toLocaleDateString('es-UY')}\n` +
            `🕐 Hora: ${appointment.time}\n` +
            `👤 Paciente: ${appointment.customer_name}\n` +
            `${appointment.doctor ? `👨‍⚕️ Profesional: ${appointment.doctor}\n` : ''}` +
            `\nSi necesitás cancelar o reagendar, avisame. ¡Te esperamos! 😊`;
        
        return this.sendTextMessage(phone, message);
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

        const message = `🍕 *Pedido listo para retirar* (N° ${order.order_number})\n\n` +
            customerNameStr +
            `📦 ${itemsList}\n\n` +
            `📍 Entregar en: ${order.address}\n` +
            `💰 Paga con: ${order.payment_method}\n` +
            `🗺 Ubicación: ${mapsLink}`;

        return this.sendTextMessage(driverPhone, message);
    }

    async notifyCustomerReady(phone, orderNumber) {
        const message = `🚀 *¡Tu pedido N° ${orderNumber} está en camino!*\n\n` +
            `El repartidor ya salió con tu pedido. ¡Buen provecho! 🍕`;
        return this.sendTextMessage(phone, message);
    }

    async downloadMedia(messageId, metadata) {
        // En Meta, el messageId para descargar media suele ser un media_id que viene en la URL.
        // Pero primero hay que hacer un GET a graph.facebook.com/v19.0/{media_id} para sacar la URL real, y luego bajar.
        if (!this.accessToken) this._loadSettings();

        try {
            // 1. Obtener URL del media
            const resMediaUrl = await axios.get(`https://graph.facebook.com/v19.0/${messageId}`, {
                headers: { 'Authorization': `Bearer ${this.accessToken}` }
            });
            const mediaUrl = resMediaUrl.data.url;

            // 2. Descargar buffer
            const resDownload = await axios.get(mediaUrl, {
                responseType: 'arraybuffer',
                headers: { 'Authorization': `Bearer ${this.accessToken}` }
            });
            
            return Buffer.from(resDownload.data, 'binary').toString('base64');
        } catch (error) {
            console.error('❌ Error descargando media de Meta:', error.message);
            throw error;
        }
    }

    /**
     * Subir media a Meta Cloud API y devolver media_id.
     */
    async uploadMedia(buffer, mimetype) {
        if (!this.accessToken || !this.phoneNumberId) {
            this._loadSettings();
            if (!this.accessToken) throw new Error("Meta Cloud API no configurada correctamente.");
        }

        const FormData = require('form-data');
        const form = new FormData();
        form.append('file', buffer, { contentType: mimetype, filename: 'media' });
        form.append('messaging_product', 'whatsapp');
        form.append('type', mimetype);

        const response = await axios.post(
            `https://graph.facebook.com/v19.0/${this.phoneNumberId}/media`,
            form,
            {
                headers: {
                    ...form.getHeaders(),
                    'Authorization': `Bearer ${this.accessToken}`
                }
            }
        );

        return response.data.id;
    }

    /**
     * Enviar imagen con caption.
     */
    async sendImageMessage(phone, imageBuffer, caption = '') {
        if (!this.accessToken || !this.phoneNumberId) {
            this._loadSettings();
            if (!this.accessToken) throw new Error("Meta Cloud API no configurada correctamente.");
        }

        const mediaId = await this.uploadMedia(imageBuffer, 'image/jpeg');
        const url = `https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`;

        try {
            await axios.post(url, {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: this._formatPhone(phone),
                type: "image",
                image: { id: mediaId, caption: caption }
            }, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`📤 Imagen enviada a ${phone} via Meta Cloud`);
        } catch (error) {
            console.error(`❌ Error enviando imagen via Meta:`, error.response ? error.response.data : error.message);
            throw error;
        }
    }

    /**
     * Enviar video con caption.
     */
    async sendVideoMessage(phone, videoBuffer, caption = '') {
        if (!this.accessToken || !this.phoneNumberId) {
            this._loadSettings();
            if (!this.accessToken) throw new Error("Meta Cloud API no configurada correctamente.");
        }

        const mediaId = await this.uploadMedia(videoBuffer, 'video/mp4');
        const url = `https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`;

        try {
            await axios.post(url, {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: this._formatPhone(phone),
                type: "video",
                video: { id: mediaId, caption: caption }
            }, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`📤 Video enviado a ${phone} via Meta Cloud`);
        } catch (error) {
            console.error(`❌ Error enviando video via Meta:`, error.response ? error.response.data : error.message);
            throw error;
        }
    }

    /**
     * Enviar documento/archivo.
     */
    async sendDocumentMessage(phone, docBuffer, filename, caption = '') {
        if (!this.accessToken || !this.phoneNumberId) {
            this._loadSettings();
            if (!this.accessToken) throw new Error("Meta Cloud API no configurada correctamente.");
        }

        const mediaId = await this.uploadMedia(docBuffer, 'application/octet-stream');
        const url = `https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`;

        try {
            await axios.post(url, {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: this._formatPhone(phone),
                type: "document",
                document: { id: mediaId, filename: filename, caption: caption }
            }, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`📤 Documento enviado a ${phone} via Meta Cloud: ${filename}`);
        } catch (error) {
            console.error(`❌ Error enviando documento via Meta:`, error.response ? error.response.data : error.message);
            throw error;
        }
    }

    async sendAppointmentConfirmation(phone, appointment, storeName = 'Clínica') {
        const message = `✅ ¡Cita confirmada!\n\n` +
            `📋 Servicio: ${appointment.service}\n` +
            `📅 Fecha: ${new Date(appointment.date).toLocaleDateString('es-UY')}\n` +
            `🕐 Hora: ${appointment.time}\n` +
            `👤 Paciente: ${appointment.customer_name}\n` +
            `${appointment.doctor ? `👨‍⚕️ Profesional: ${appointment.doctor}\n` : ''}` +
            `\nSi necesitás cancelar o reagendar, avisame. ¡Te esperamos! 😊`;
        
        await this.sendTextMessage(phone, message);
    }
}

module.exports = MetaCloudProvider;

/**
 * Clase Base para Proveedores de WhatsApp
 * Define los métodos estándar que cualquier implementación (Baileys o Meta) debe tener.
 */
class WhatsappProvider {
    /**
     * Inicializa el cliente y lo conecta si es necesario.
     */
    async initialize(io) {
        throw new Error('Method not implemented.');
    }

    /**
     * Enviar mensaje de texto simple.
     */
    async sendTextMessage(phone, text) {
        throw new Error('Method not implemented.');
    }

    /**
     * Enviar imagen con caption opcional.
     * @param {string} phone - Teléfono destino
     * @param {Buffer} imageBuffer - Buffer de la imagen
     * @param {string} caption - Texto opcional
     * @param {string} filename - Nombre del archivo (opcional, para document)
     */
    async sendImageMessage(phone, imageBuffer, caption = '') {
        throw new Error('Method not implemented.');
    }

    /**
     * Enviar video con caption opcional.
     * @param {string} phone - Teléfono destino
     * @param {Buffer} videoBuffer - Buffer del video
     * @param {string} caption - Texto opcional
     */
    async sendVideoMessage(phone, videoBuffer, caption = '') {
        throw new Error('Method not implemented.');
    }

    /**
     * Enviar documento/archivo.
     * @param {string} phone - Teléfono destino
     * @param {Buffer} docBuffer - Buffer del documento
     * @param {string} filename - Nombre del archivo
     * @param {string} caption - Texto opcional
     */
    async sendDocumentMessage(phone, docBuffer, filename, caption = '') {
        throw new Error('Method not implemented.');
    }

    /**
     * Subir media y devolver media_id (para Meta Cloud API).
     * @param {Buffer} buffer - Buffer del archivo
     * @param {string} mimetype - Tipo MIME
     * @returns {string} media_id
     */
    async uploadMedia(buffer, mimetype) {
        throw new Error('Method not implemented.');
    }

    /**
     * Enviar confirmación de pedido al cliente.
     */
    async sendOrderConfirmation(phone, orderData) {
        throw new Error('Method not implemented.');
    }

    /**
     * Enviar confirmación de cita al cliente.
     */
    async sendAppointmentConfirmation(phone, appointment, storeName = 'Clínica') {
        throw new Error('Method not implemented.');
    }

    /**
     * Notificar al repartidor que el pedido está listo.
     */
    async notifyDelivery(order, driverPhone) {
        throw new Error('Method not implemented.');
    }

    /**
     * Notificar al cliente que su pedido está en camino.
     */
    async notifyCustomerReady(phone, orderNumber) {
        throw new Error('Method not implemented.');
    }

    /**
     * Descargar media (audio/imagen/video) de un mensaje.
     * En Meta devuelve URL temporal, en Baileys devuelve Base64/Buffer.
     */
    async downloadMedia(messageId, metadata) {
        throw new Error('Method not implemented.');
    }

    /**
     * Formatear número de teléfono a estándar internacional sin +.
     */
    _formatPhone(phone) {
        return phone.replace(/[^\d]/g, '');
    }

    /**
     * Generar link de Google Maps.
     */
    _generateMapsLink(address) {
        const encoded = encodeURIComponent(address);
        return `https://maps.google.com/?q=${encoded}`;
    }
}

module.exports = WhatsappProvider;

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const WhatsAppManager = require('../services/whatsapp');
const MessageProcessor = require('../services/messageProcessor');
const db = require('../config/db').getDb();

/**
 * Middleware para validar la firma de los eventos de Meta.
 */
function verifySignature(req, res, next) {
    const signature = req.headers['x-hub-signature-256'];
    const appSecret = process.env.META_APP_SECRET;

    if (!appSecret) {
        if (process.env.NODE_ENV === 'production') {
            console.error('❌ Error de seguridad crítico: META_APP_SECRET no está configurado en producción.');
            return res.status(500).send('Server security configuration error');
        }
        return next(); // Permitido únicamente en modo desarrollo/testing local
    }

    if (!signature) {
        console.warn('⚠️ Webhook recibido sin firma X-Hub-Signature-256');
        return res.status(401).send('Signature required');
    }

    const parts = signature.split('=');
    const signatureHash = parts[1] || '';

    const expectedHash = crypto
        .createHmac('sha256', appSecret)
        .update(req.rawBody || '')
        .digest('hex');

    const signatureBuffer = Buffer.from(signatureHash, 'utf-8');
    const expectedBuffer = Buffer.from(expectedHash, 'utf-8');

    if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
        console.error('❌ Firma de webhook inválida');
        return res.status(401).send('Invalid signature');
    }

    next();
}

/**
 * GET /webhook
 * Endpoint requerido por Meta para verificar el Webhook (hub.challenge).
 */
router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyTokenRow = db.prepare("SELECT value FROM settings WHERE key = 'meta_verify_token'").get();
    const VERIFY_TOKEN = verifyTokenRow ? verifyTokenRow.value : '';

    if (mode && token) {
        // Verificar si el token coincide con alguna de nuestras conexiones activas
        const exists = db.prepare("SELECT 1 FROM whatsapp_connections WHERE meta_verify_token = ? AND active = 1").get(token);
        const globalVerifyToken = db.prepare("SELECT value FROM settings WHERE key = 'meta_verify_token'").get()?.value;
        
        if (mode === 'subscribe' && (exists || token === globalVerifyToken)) {
            console.log('✅ Webhook verificado por Meta');
            return res.status(200).send(challenge);
        } else {
            console.error('❌ Falló la verificación del webhook de Meta (Token incorrecto)');
            return res.sendStatus(403);
        }
    }
    return res.status(200).send("Webhook endpoint is active.");
});

/**
 * POST /webhook
 * Recibe eventos de Meta Cloud API.
 * Soporta: text, audio, image, video, document, location
 */
router.post('/', verifySignature, async (req, res) => {
    try {
        const payload = req.body;

        // Validar formato de Meta
        if (payload.object !== 'whatsapp_business_account') {
            return res.sendStatus(404);
        }

        const io = req.app.get('io');
        
        // Obtener el Phone ID del mensaje entrante para identificar el proveedor/tienda correcto
        let provider = null;
        if (payload.entry && payload.entry[0].changes && payload.entry[0].changes[0].value.metadata) {
            const phoneId = payload.entry[0].changes[0].value.metadata.phone_number_id;
            if (phoneId) {
                provider = WhatsAppManager.getProviderByPhoneId(phoneId);
            }
        }
        
        // Fallback al proveedor por defecto si no encontramos coincidencia
        if (!provider) {
            provider = WhatsAppManager.provider;
        }

        if (!provider) {
            return res.status(200).send("No provider available");
        }

        if (payload.entry && payload.entry[0].changes && payload.entry[0].changes[0].value.messages) {
            const messageData = payload.entry[0].changes[0].value.messages[0];
            const contactData = payload.entry[0].changes[0].value.contacts[0];
            
            const customerPhone = '+' + contactData.wa_id;
            const customerName = contactData.profile?.name || null;
            let messageText = '';
            let audioMessageId = null;
            let mediaData = null;

            switch (messageData.type) {
                case 'text':
                    messageText = messageData.text.body;
                    break;

                case 'audio':
                    audioMessageId = messageData.audio.id;
                    break;

                case 'image':
                    mediaData = {
                        type: 'image',
                        mediaId: messageData.image.id,
                        caption: messageData.image.caption || '',
                        mimeType: 'image/jpeg'
                    };
                    console.log(`📸 Imagen recibida de ${customerPhone} via Meta Cloud`);
                    break;

                case 'video':
                    mediaData = {
                        type: 'video',
                        mediaId: messageData.video.id,
                        caption: messageData.video.caption || '',
                        mimeType: 'video/mp4'
                    };
                    console.log(`🎬 Video recibido de ${customerPhone} via Meta Cloud`);
                    break;

                case 'document':
                    mediaData = {
                        type: 'document',
                        mediaId: messageData.document.id,
                        filename: messageData.document.filename || 'documento',
                        caption: messageData.document.caption || '',
                        mimeType: messageData.document.mime_type || 'application/octet-stream'
                    };
                    console.log(`📄 Documento recibido de ${customerPhone} via Meta Cloud: ${mediaData.filename}`);
                    break;

                case 'location':
                    const loc = messageData.location;
                    messageText = `Ubicación compartida: https://maps.google.com/?q=${loc.latitude},${loc.longitude}`;
                    break;

                default:
                    console.log(`⚠️ Tipo de mensaje no soportado de Meta: ${messageData.type}`);
                    return res.status(200).send("EVENT_RECEIVED");
            }

            const QueueService = require('../services/QueueService');
            await QueueService.enqueueMessage({
                storeId: provider ? provider.storeId : null,
                customerPhone,
                messageText,
                audioMessageId,
                metadata: null,
                customerName,
                mediaData,
                providerId: provider ? provider.id : null
            });
        }

        res.status(200).send("EVENT_RECEIVED");
    } catch (error) {
        console.error('❌ Error en webhook de Meta:', error);
        res.status(200).send("EVENT_RECEIVED"); // Meta recomienda siempre retornar 200
    }
});

module.exports = router;

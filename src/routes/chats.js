const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../config/db');
const WhatsAppService = require('../services/whatsapp');
const { requireAuth } = require('../middleware/auth');

// Configurar multer para subir archivos de chat
const chatStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', '..', 'data', 'chat-media');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'chat-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const chatUpload = multer({
    storage: chatStorage,
    limits: { fileSize: 16 * 1024 * 1024 } // 16MB max (WhatsApp limit)
});

/**
 * GET /api/chats
 * Obtener lista de chats (conversaciones activas y derivaciones).
 */
router.get('/', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const db = getDb();
        
        const filter = req.query.filter || 'all';
        
        let query = `
            SELECT c.id, c.customer_phone, c.messages, c.status, c.needs_human, c.updated_at, 
                   c.is_favorite, c.is_archived, c.is_blocked, c.is_deleted,
                   cust.name as customer_name
            FROM conversations c
            LEFT JOIN customers cust ON c.customer_phone = cust.phone AND cust.store_id = c.store_id
            WHERE c.store_id = ? AND c.is_deleted = 0
        `;
        
        if (filter === 'favorites') {
            query += ' AND c.is_favorite = 1';
        } else if (filter === 'archived') {
            query += ' AND c.is_archived = 1';
        } else {
            query += ' AND c.is_archived = 0';
        }
        
        query += ' ORDER BY c.updated_at DESC';
        
        const conversations = db.prepare(query).all(storeId);
        
        // Parse messages and get last message for preview
        const chats = conversations.map(conv => {
            let messages = [];
            let lastMessage = '';
            try {
                messages = JSON.parse(conv.messages);
                if (messages.length > 0) {
                    lastMessage = messages[messages.length - 1].content || '';
                }
            } catch(e) {}
            
            return {
                id: conv.id,
                customer_phone: conv.customer_phone,
                customer_name: conv.customer_name || conv.customer_phone,
                status: conv.status,
                needs_human: conv.needs_human,
                is_favorite: conv.is_favorite,
                is_archived: conv.is_archived,
                is_blocked: conv.is_blocked,
                last_message: lastMessage.substring(0, 100),
                message_count: messages.length,
                updated_at: conv.updated_at
            };
        });
        
        res.json(chats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/chats/:phone/messages
 * Obtener mensajes de una conversación específica.
 */
router.get('/:phone/messages', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const db = getDb();
        const phone = req.params.phone;
        
        const conv = db.prepare(`
            SELECT * FROM conversations 
            WHERE store_id = ? AND customer_phone = ? 
            ORDER BY updated_at DESC LIMIT 1
        `).get(storeId, phone);
        
        if (!conv) {
            return res.json({ messages: [] });
        }
        
        let messages = [];
        try {
            messages = JSON.parse(conv.messages);
        } catch(e) {}
        
        res.json({ 
            conversation_id: conv.id,
            messages,
            needs_human: conv.needs_human,
            status: conv.status
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/chats/:phone/send
 * Enviar un mensaje manual desde el admin.
 */
router.post('/:phone/send', requireAuth, async (req, res) => {
    try {
        const { message } = req.body;
        const phone = req.params.phone;
        const storeId = req.user.store_id;
        const db = getDb();
        
        if (!message) {
            return res.status(400).json({ error: 'Mensaje requerido' });
        }
        
        await WhatsAppService.sendTextMessage(phone, message, storeId);

        // Guardar mensaje enviado por el operador en la BD
        const conv = db.prepare(`
            SELECT id, messages FROM conversations 
            WHERE store_id = ? AND customer_phone = ? AND status = 'active'
            ORDER BY updated_at DESC LIMIT 1
        `).get(storeId, phone);

        const newMsg = { role: 'ai', content: message };

        if (conv) {
            let messages = [];
            try { messages = JSON.parse(conv.messages); } catch(e){}
            messages.push(newMsg);
            db.prepare(`
                UPDATE conversations 
                SET messages = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(JSON.stringify(messages.slice(-20)), conv.id);
        } else {
            db.prepare(`
                INSERT INTO conversations (store_id, customer_phone, messages)
                VALUES (?, ?, ?)
            `).run(storeId, phone, JSON.stringify([newMsg]));
        }

        // Notificar en tiempo real por WebSockets
        const io = req.app.get('io');
        if (io) {
            io.to('admin').emit('chat-update', {
                customer_phone: phone,
                message: { role: 'ai', content: message, timestamp: new Date().toISOString() }
            });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/chats/:phone/send-media
 * Enviar imagen, audio o documento desde el admin.
 */
router.post('/:phone/send-media', requireAuth, chatUpload.single('media'), async (req, res) => {
    try {
        const phone = req.params.phone;
        const storeId = req.user.store_id;
        const { message, mediaType } = req.body;
        const db = getDb();
        
        if (!req.file) {
            return res.status(400).json({ error: 'Archivo requerido' });
        }

        const filePath = req.file.path;
        const fileBuffer = fs.readFileSync(filePath);
        const caption = message || '';

        switch (mediaType) {
            case 'image':
                await WhatsAppService.sendImageMessage(phone, fileBuffer, caption, storeId);
                break;
            case 'audio':
                await WhatsAppService.sendDocumentMessage(phone, fileBuffer, req.file.originalname, caption, storeId);
                break;
            case 'document':
            default:
                await WhatsAppService.sendDocumentMessage(phone, fileBuffer, req.file.originalname, caption, storeId);
                break;
        }

        // Limpiar archivo temporal después de enviar
        try { fs.unlinkSync(filePath); } catch(e) {}

        const mediaMsgText = caption 
            ? `📷 [Archivo adjunto: ${req.file.originalname}] ${caption}`
            : `📷 [Archivo adjunto: ${req.file.originalname}]`;

        const conv = db.prepare(`
            SELECT id, messages FROM conversations 
            WHERE store_id = ? AND customer_phone = ? AND status = 'active'
            ORDER BY updated_at DESC LIMIT 1
        `).get(storeId, phone);

        const newMsg = { role: 'ai', content: mediaMsgText };

        if (conv) {
            let messages = [];
            try { messages = JSON.parse(conv.messages); } catch(e){}
            messages.push(newMsg);
            db.prepare(`
                UPDATE conversations 
                SET messages = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(JSON.stringify(messages.slice(-20)), conv.id);
        } else {
            db.prepare(`
                INSERT INTO conversations (store_id, customer_phone, messages)
                VALUES (?, ?, ?)
            `).run(storeId, phone, JSON.stringify([newMsg]));
        }

        const io = req.app.get('io');
        if (io) {
            io.to('admin').emit('chat-update', {
                customer_phone: phone,
                message: { role: 'ai', content: mediaMsgText, timestamp: new Date().toISOString() }
            });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error sending media:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PATCH /api/chats/:phone/favorite
 * Toggle favorito.
 */
router.patch('/:phone/favorite', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const db = getDb();
        const phone = req.params.phone;
        
        db.prepare(`
            UPDATE conversations SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END
            WHERE store_id = ? AND customer_phone = ?
        `).run(storeId, phone);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PATCH /api/chats/:phone/archive
 * Toggle archivado.
 */
router.patch('/:phone/archive', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const db = getDb();
        const phone = req.params.phone;
        
        db.prepare(`
            UPDATE conversations SET is_archived = CASE WHEN is_archived = 1 THEN 0 ELSE 1 END
            WHERE store_id = ? AND customer_phone = ?
        `).run(storeId, phone);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PATCH /api/chats/:phone/block
 * Toggle bloqueado.
 */
router.patch('/:phone/block', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const db = getDb();
        const phone = req.params.phone;
        
        db.prepare(`
            UPDATE conversations SET is_blocked = CASE WHEN is_blocked = 1 THEN 0 ELSE 1 END
            WHERE store_id = ? AND customer_phone = ?
        `).run(storeId, phone);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/chats/:phone
 * Eliminar chat.
 */
router.delete('/:phone', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const db = getDb();
        const phone = req.params.phone;
        
        db.prepare(`
            UPDATE conversations SET is_deleted = 1
            WHERE store_id = ? AND customer_phone = ?
        `).run(storeId, phone);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/chats/:phone/clear
 * Vaciar mensajes de un chat.
 */
router.delete('/:phone/clear', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const db = getDb();
        const phone = req.params.phone;
        
        db.prepare(`
            UPDATE conversations SET messages = '[]', updated_at = CURRENT_TIMESTAMP
            WHERE store_id = ? AND customer_phone = ?
        `).run(storeId, phone);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/chats/:phone/note
 * Guardar una nota privada interna.
 */
router.post('/:phone/note', requireAuth, (req, res) => {
    try {
        const { message } = req.body;
        const phone = req.params.phone;
        const storeId = req.user.store_id;
        const operatorName = req.user.name || 'Admin';
        const db = getDb();
        
        if (!message) {
            return res.status(400).json({ error: 'Mensaje requerido' });
        }
        
        // Buscar conversación
        const conv = db.prepare(`
            SELECT id, messages FROM conversations 
            WHERE store_id = ? AND customer_phone = ? 
            ORDER BY updated_at DESC LIMIT 1
        `).get(storeId, phone);
        
        let messages = [];
        if (conv) {
            try {
                messages = JSON.parse(conv.messages);
            } catch(e) {}
        }
        
        const newNote = {
            role: 'note',
            content: message,
            timestamp: new Date().toISOString(),
            operator: operatorName
        };
        
        messages.push(newNote);
        
        if (conv) {
            db.prepare(`
                UPDATE conversations 
                SET messages = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(JSON.stringify(messages.slice(-20)), conv.id);
        } else {
            db.prepare(`
                INSERT INTO conversations (store_id, customer_phone, messages, status, needs_human)
                VALUES (?, ?, ?, 'open', 1)
            `).run(storeId, phone, JSON.stringify([newNote]));
        }
        
        // Notificar en tiempo real por Socket.IO
        const io = req.app.get('io');
        if (io) {
            io.to('admin').emit('chat-update', {
                customer_phone: phone,
                message: newNote
            });
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;


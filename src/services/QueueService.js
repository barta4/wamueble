const { getDb } = require('../config/db');
const { query: pgQuery } = require('../config/postgres');

class QueueService {
    constructor() {
        this.isRunning = false;
        this.workerInterval = null;
        this.io = null;
    }

    /**
     * Comprueba si la aplicación está corriendo con PostgreSQL.
     */
    isPgMode() {
        return process.env.USE_POSTGRES === 'true' || !!process.env.DATABASE_URL;
    }

    /**
     * Encola un mensaje entrante de WhatsApp para procesamiento asíncrono.
     * Cero pérdida de datos ante picos de tráfico o reinicio del servidor.
     */
    async enqueueMessage({ storeId, customerPhone, messageText, audioMessageId, metadata, customerName, mediaData, providerId }) {
        const payload = JSON.stringify({
            messageText,
            customerPhone,
            audioMessageId,
            metadata,
            customerName,
            mediaData,
            providerId
        });

        if (this.isPgMode()) {
            const res = await pgQuery(`
                INSERT INTO message_queue (store_id, customer_phone, payload, status)
                VALUES ($1, $2, $3, 'pending')
                RETURNING id
            `, [storeId || null, customerPhone, payload]);
            console.log(`📥 [Queue Postgres] Mensaje encolado ID #${res.rows[0].id} para ${customerPhone}`);
            return res.rows[0].id;
        } else {
            const db = getDb();
            // Asegurar tabla en SQLite por compatibilidad
            db.prepare(`
                CREATE TABLE IF NOT EXISTS message_queue (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    store_id INTEGER,
                    customer_phone TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    status TEXT DEFAULT 'pending',
                    attempts INTEGER DEFAULT 0,
                    max_attempts INTEGER DEFAULT 3,
                    error_message TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `).run();

            const result = db.prepare(`
                INSERT INTO message_queue (store_id, customer_phone, payload, status)
                VALUES (?, ?, ?, 'pending')
            `).run(storeId || null, customerPhone, payload);
            console.log(`📥 [Queue SQLite] Mensaje encolado ID #${result.lastInsertRowid} para ${customerPhone}`);
            return result.lastInsertRowid;
        }
    }

    /**
     * Obtiene y bloquea el siguiente trabajo pendiente de forma atómica.
     * En Postgres usa 'FOR UPDATE SKIP LOCKED'.
     */
    async fetchNextJob() {
        if (this.isPgMode()) {
            const res = await pgQuery(`
                UPDATE message_queue 
                SET status = 'processing', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP 
                WHERE id = (
                    SELECT id FROM message_queue 
                    WHERE status = 'pending' AND attempts < max_attempts 
                    ORDER BY created_at ASC 
                    FOR UPDATE SKIP LOCKED 
                    LIMIT 1
                ) RETURNING *
            `);
            return res.rows[0] || null;
        } else {
            const db = getDb();
            const job = db.prepare(`
                SELECT * FROM message_queue 
                WHERE status = 'pending' AND attempts < max_attempts 
                ORDER BY created_at ASC 
                LIMIT 1
            `).get();

            if (!job) return null;

            db.prepare(`
                UPDATE message_queue 
                SET status = 'processing', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `).run(job.id);

            return job;
        }
    }

    /**
     * Actualizar estado del trabajo a completado o fallido.
     */
    async updateJobStatus(jobId, status, errorMessage = null) {
        if (this.isPgMode()) {
            await pgQuery(`
                UPDATE message_queue 
                SET status = $1, error_message = $2, updated_at = CURRENT_TIMESTAMP 
                WHERE id = $3
            `, [status, errorMessage, jobId]);
        } else {
            const db = getDb();
            db.prepare(`
                UPDATE message_queue 
                SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `).run(status, errorMessage, jobId);
        }
    }

    /**
     * Procesa un solo trabajo en cola.
     */
    async processJob(job) {
        const MessageProcessor = require('./messageProcessor');
        const WhatsAppManager = require('./whatsapp');

        try {
            const data = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
            const provider = data.providerId ? WhatsAppManager.getProvider(data.providerId) : WhatsAppManager.provider;

            await MessageProcessor.handleIncoming(
                data.messageText,
                data.customerPhone,
                data.audioMessageId,
                provider,
                this.io || WhatsAppManager.io,
                data.metadata,
                data.customerName,
                data.mediaData
            );

            await this.updateJobStatus(job.id, 'completed');
            console.log(`✅ [Queue Worker] Trabajo #${job.id} procesado con éxito para ${job.customer_phone}`);
        } catch (error) {
            console.error(`❌ [Queue Worker] Error procesando trabajo #${job.id}:`, error.message);
            await this.updateJobStatus(job.id, 'failed', error.message);
        }
    }

    /**
     * Arranca el worker que procesa mensajes en segundo plano continuamente.
     */
    startWorker(io = null, intervalMs = 1000) {
        if (this.isRunning) return;
        this.isRunning = true;
        this.io = io;

        console.log('⚙️ [Queue Worker] Iniciando trabajador de cola de mensajes...');

        this.workerInterval = setInterval(async () => {
            try {
                const job = await this.fetchNextJob();
                if (job) {
                    await this.processJob(job);
                }
            } catch (e) {
                console.error('❌ Error en el loop del Queue Worker:', e.message);
            }
        }, intervalMs);
    }

    /**
     * Detener el worker.
     */
    stopWorker() {
        if (this.workerInterval) {
            clearInterval(this.workerInterval);
            this.workerInterval = null;
        }
        this.isRunning = false;
        console.log('🛑 [Queue Worker] Trabajador de cola detenido.');
    }
}

const queueService = new QueueService();
module.exports = queueService;

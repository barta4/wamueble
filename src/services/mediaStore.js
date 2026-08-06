/**
 * Servicio de Almacenamiento de Medios
 * Guarda imágenes y videos recibidos por WhatsApp localmente.
 * Sirve archivos estáticos para el dashboard de cocina.
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class MediaStore {
    constructor() {
        this.baseDir = path.join(__dirname, '..', '..', 'data', 'media');
        this.maxFileSize = 10 * 1024 * 1024; // 10MB
        this._ensureBaseDir();
    }

    /**
     * Asegurar que el directorio base existe.
     */
    _ensureBaseDir() {
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
        }
    }

    /**
     * Obtener directorio de medios para un store.
     */
    _getStoreDir(storeId) {
        const dir = path.join(this.baseDir, String(storeId));
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        return dir;
    }

    /**
     * Obtener directorio de medios para un pedido.
     */
    _getOrderDir(storeId, orderId) {
        const dir = path.join(this._getStoreDir(storeId), String(orderId || 'unlinked'));
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        return dir;
    }

    /**
     * Guardar un archivo de media.
     * 
     * @param {number} storeId - ID del store
     * @param {Buffer} buffer - Buffer del archivo
     * @param {string} originalName - Nombre original del archivo
     * @param {string} mimeType - Tipo MIME
     * @param {number|null} orderId - ID del pedido (opcional)
     * @returns {Object} { filename, url, path }
     */
    saveMedia(storeId, buffer, originalName, mimeType, orderId = null) {
        if (buffer.length > this.maxFileSize) {
            throw new Error(`Archivo excede el límite de ${this.maxFileSize / 1024 / 1024}MB`);
        }

        const ext = this._getExtension(originalName, mimeType);
        const filename = `${uuidv4()}${ext}`;
        const orderDir = this._getOrderDir(storeId, orderId);
        const filePath = path.join(orderDir, filename);

        fs.writeFileSync(filePath, buffer);

        const relativePath = `/media/${storeId}/${orderId || 'unlinked'}/${filename}`;
        
        console.log(`💾 Media guardada: ${relativePath} (${buffer.length} bytes)`);
        
        return {
            filename,
            originalName,
            mimeType,
            url: relativePath,
            path: filePath,
            size: buffer.length
        };
    }

    /**
     * Obtener la extensión del archivo basada en el nombre o mimetype.
     */
    _getExtension(originalName, mimeType) {
        if (originalName && originalName.includes('.')) {
            return path.extname(originalName);
        }

        const mimeToExt = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'image/webp': '.webp',
            'video/mp4': '.mp4',
            'video/webm': '.webm',
            'video/quicktime': '.mov',
            'audio/ogg': '.ogg',
            'audio/mpeg': '.mp3',
            'application/pdf': '.pdf'
        };

        return mimeToExt[mimeType] || '.bin';
    }

    /**
     * Obtener buffer de un archivo de media.
     */
    getMedia(storeId, orderId, filename) {
        const filePath = path.join(this._getOrderDir(storeId, orderId), filename);
        if (!fs.existsSync(filePath)) {
            return null;
        }
        return fs.readFileSync(filePath);
    }

    /**
     * Eliminar todos los medios de un pedido.
     */
    deleteOrderMedia(storeId, orderId) {
        const orderDir = path.join(this._getStoreDir(storeId), String(orderId));
        if (fs.existsSync(orderDir)) {
            fs.rmSync(orderDir, { recursive: true, force: true });
            console.log(`🗑️  Medios del pedido ${orderId} eliminados`);
        }
    }

    /**
     * Limpiar medios de pedidos entregados hace más de N días.
     */
    cleanupOldMedia(storeId, daysOld = 7) {
        const storeDir = this._getStoreDir(storeId);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        let cleaned = 0;
        const orderDirs = fs.readdirSync(storeDir);
        
        for (const orderId of orderDirs) {
            const orderDir = path.join(storeDir, orderId);
            const stat = fs.statSync(orderDir);
            
            if (stat.isDirectory() && stat.mtime < cutoffDate) {
                fs.rmSync(orderDir, { recursive: true, force: true });
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`🧹 ${cleaned} directorios de medios antiguos limpiados`);
        }
    }

    /**
     * Obtener info de un archivo de media.
     */
    getMediaInfo(storeId, orderId, filename) {
        const filePath = path.join(this._getOrderDir(storeId, orderId), filename);
        if (!fs.existsSync(filePath)) {
            return null;
        }
        const stat = fs.statSync(filePath);
        return {
            filename,
            path: filePath,
            size: stat.size,
            modified: stat.mtime
        };
    }
}

// Singleton
const mediaStore = new MediaStore();

module.exports = mediaStore;

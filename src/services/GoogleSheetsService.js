const axios = require('axios');
const XLSX = require('xlsx');
const { getDb } = require('../config/db');
const Store = require('../models/Store');
const Product = require('../models/Product');

class GoogleSheetsService {
    /**
     * Parsea una URL de Google Sheets y extrae el Spreadsheet ID y el GID.
     */
    static parseSheetUrl(url) {
        if (!url || typeof url !== 'string') {
            throw new Error('Debe proporcionar una URL válida de Google Sheets.');
        }

        const trimmed = url.trim();

        // 1. Caso: Documento publicado en la web (docs.google.com/spreadsheets/d/e/2PACX-.../pubhtml o /pub)
        const pubMatch = trimmed.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/i);
        if (pubMatch) {
            const gidMatch = trimmed.match(/[#&?]gid=([0-9]+)/i);
            return {
                spreadsheetId: pubMatch[1],
                gid: gidMatch ? gidMatch[1] : '0',
                isPublishedWeb: true
            };
        }

        // 2. Caso: URL estándar (docs.google.com/spreadsheets/d/1BxiMVs.../edit)
        const stdMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
        if (stdMatch) {
            const gidMatch = trimmed.match(/[#&?]gid=([0-9]+)/i);
            return {
                spreadsheetId: stdMatch[1],
                gid: gidMatch ? gidMatch[1] : '0',
                isPublishedWeb: false
            };
        }

        // 3. Caso: Solo ID proporcionado
        if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
            return {
                spreadsheetId: trimmed,
                gid: '0',
                isPublishedWeb: false
            };
        }

        throw new Error('Formato de URL de Google Sheets no reconocido. Asegurate de copiar el enlace completo.');
    }

    /**
     * Construye las URLs de exportación CSV para una hoja de cálculo.
     */
    static getExportUrls(parsed) {
        const { spreadsheetId, gid, isPublishedWeb } = parsed;
        const urls = [];

        if (isPublishedWeb) {
            urls.push(`https://docs.google.com/spreadsheets/d/e/${spreadsheetId}/pub?output=csv&gid=${gid || '0'}`);
            urls.push(`https://docs.google.com/spreadsheets/d/e/${spreadsheetId}/pub?output=csv`);
        } else {
            // Google Visualization API CSV export (muy confiable para hojas con enlace público)
            urls.push(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&gid=${gid || '0'}`);
            // Direct export endpoint oficial
            urls.push(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&id=${spreadsheetId}&gid=${gid || '0'}`);
        }

        return urls;
    }

    /**
     * Descarga y parsea los datos de una hoja de Google Sheets.
     */
    static async fetchSheetData(sheetUrl) {
        const parsed = this.parseSheetUrl(sheetUrl);
        const exportUrls = this.getExportUrls(parsed);
        let csvBuffer = null;
        let lastError = null;

        // Intentar descargar desde las URLs de exportación
        for (const url of exportUrls) {
            try {
                const response = await axios.get(url, {
                    responseType: 'arraybuffer',
                    timeout: 12000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WaBot-SaaS/2.8'
                    }
                });

                // Verificar que no sea una página de login de Google (HTML)
                const textCheck = Buffer.from(response.data).toString('utf8', 0, 300);
                if (textCheck.includes('<!DOCTYPE html') || textCheck.includes('<html') || textCheck.includes('accounts.google.com')) {
                    throw new Error('La planilla es privada. Por favor, cambiá los permisos de la planilla a "Cualquier persona con el enlace puede ver" (Lector).');
                }

                csvBuffer = response.data;
                break;
            } catch (err) {
                lastError = err;
                if (err.message.includes('La planilla es privada')) {
                    throw err;
                }
            }
        }

        if (!csvBuffer) {
            throw new Error(`No se pudo acceder a la planilla de Google Sheets: ${lastError ? lastError.message : 'Error de descarga'}. Verificá que la planilla sea pública o compartida para cualquier persona con el enlace.`);
        }

        // Parsear CSV usando XLSX con codificación UTF-8 explícita para preservar tildes y caracteres especiales
        let workbook;
        try {
            const csvString = Buffer.from(csvBuffer).toString('utf8');
            workbook = XLSX.read(csvString, { type: 'string', codepage: 65001 });
        } catch (e) {
            workbook = XLSX.read(csvBuffer, { type: 'buffer', codepage: 65001 });
        }

        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
            throw new Error('La planilla de Google Sheets no contiene hojas con datos.');
        }

        const sheet = workbook.Sheets[sheetName];
        // Obtener headers y filas
        const rawJson = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

        if (!rawJson || rawJson.length === 0) {
            throw new Error('La planilla de Google Sheets está vacía o no contiene filas de datos.');
        }

        // Obtener nombres de columnas
        const headers = Object.keys(rawJson[0]);

        return {
            spreadsheetId: parsed.spreadsheetId,
            gid: parsed.gid,
            headers,
            rows: rawJson,
            totalRows: rawJson.length
        };
    }

    /**
     * Normaliza URLs de imágenes (especialmente enlaces compartidos de Google Drive).
     * Convierte enlaces de previsualización en enlaces directos renderizables.
     */
    static normalizeImageUrl(url) {
        if (!url || typeof url !== 'string') return null;
        let trimmed = url.trim();
        if (!trimmed) return null;

        // Caso Google Drive: drive.google.com/file/d/{ID}/view o open?id={ID}
        if (trimmed.includes('drive.google.com')) {
            const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i) || trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
            if (fileMatch) {
                const fileId = fileMatch[1];
                return `https://drive.google.com/uc?export=view&id=${fileId}`;
            }
        }

        // Caso Dropbox: dl=0 -> dl=1 para enlace directo de descarga/render
        if (trimmed.includes('dropbox.com') && trimmed.includes('dl=0')) {
            return trimmed.replace('dl=0', 'dl=1');
        }

        return trimmed;
    }

    /**
     * Detección automática sugerida para mapeo de columnas según nombres comunes en español e inglés.
     */
    static autoDetectMapping(headers) {
        const mapping = {
            name: '',
            price: '',
            description: '',
            category: '',
            is_service: '',
            duration: '',
            available: '',
            image_path: '',
            sku: ''
        };

        const patterns = {
            name: [/^(nombre|name|producto|product|item|articulo|artículo|t[ií]tulo)$/i, /nombre|producto|articulo/i],
            price: [/^(precio|price|costo|cost|valor|importe|\$)$/i, /precio|costo|valor/i],
            description: [/^(descripci[oó]n|description|detalle|ingredientes|detalles|info)$/i, /descrip/i],
            category: [/^(categor[ií]a|category|rubro|secci[oó]n|grupo|familia)$/i, /categor|rubro/i],
            is_service: [/^(es_servicio|servicio|service|tipo)$/i],
            duration: [/^(duraci[oó]n|duration|tiempo|minutos|min)$/i],
            available: [/^(disponible|activo|stock|habilitado|available|active)$/i, /disponib|stock/i],
            image_path: [
                /^(imagen|image|foto|photo|url_imagen|imagen_url|image_url|img_url|url_foto|foto_url|url|link|picture|portada|img)$/i,
                /imagen|foto|image|picture/i
            ],
            sku: [/^(sku|c[oó]digo|code|cod|referencia|ref|id_producto)$/i, /codigo|código|sku/i]
        };

        for (const [field, regexList] of Object.entries(patterns)) {
            for (const header of headers) {
                const trimmed = header.trim();
                if (regexList.some(r => r.test(trimmed))) {
                    mapping[field] = trimmed;
                    break;
                }
            }
        }

        // Alias para compatibilidad con pruebas y clientes
        mapping.image = mapping.image_path;

        return mapping;
    }

    /**
     * Limpia y sanitiza un valor de precio para convertirlo a Float confiable.
     * Soporta: "$1.500,50", "1500.50", "1,500", etc.
     */
    static cleanPrice(rawPrice) {
        if (typeof rawPrice === 'number') {
            return isNaN(rawPrice) ? 0 : Math.max(0, rawPrice);
        }

        if (!rawPrice) return 0;

        let str = String(rawPrice).trim();
        // Quitar signos de moneda y espacios
        str = str.replace(/[\$€USD\s]/gi, '');

        // Caso formato latinoamericano / europeo: 1.500,50 o 1500,50
        if (str.includes(',') && !str.includes('.')) {
            str = str.replace(',', '.');
        } else if (str.includes('.') && str.includes(',')) {
            // Ejemplo: 1.500,50 -> quitar punto y cambiar coma a punto
            if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
                str = str.replace(/\./g, '').replace(',', '.');
            } else {
                // Ejemplo: 1,500.50 -> quitar coma
                str = str.replace(/,/g, '');
            }
        }

        const num = parseFloat(str);
        return isNaN(num) ? 0 : Math.max(0, num);
    }

    /**
     * Ejecuta la sincronización de productos contra la base de datos de la tienda.
     * Soporta modos:
     * - 'upsert' (por defecto): actualiza productos existentes con igual nombre y agrega nuevos.
     * - 'replace': elimina los productos actuales de la tienda e inserta los de la planilla.
     */
    static async syncProducts(storeId, { sheetUrl, columnMapping, syncMode = 'upsert' }) {
        if (!storeId) {
            throw new Error('ID de tienda requerido para sincronizar productos.');
        }

        if (!columnMapping || !columnMapping.name || !columnMapping.price) {
            throw new Error('El mapeo de columnas debe incluir al menos "Nombre" y "Precio".');
        }

        const { rows, headers } = await this.fetchSheetData(sheetUrl);

        const store = Store.getById(storeId);
        if (!store) {
            throw new Error('Tienda no encontrada.');
        }

        const db = getDb();
        const categories = new Set();

        // Cargar categorías existentes
        try {
            const existingCats = JSON.parse(store.categories || '["General"]');
            existingCats.forEach(c => categories.add(typeof c === 'string' ? c : c.name || 'General'));
        } catch (e) {
            categories.add('General');
        }

        let inserted = 0;
        let updated = 0;
        let skipped = 0;
        const errors = [];

        // Ejecutar dentro de una transacción SQLite para atomicidad y velocidad
        const runSync = db.transaction(() => {
            if (syncMode === 'replace') {
                db.prepare('DELETE FROM products WHERE store_id = ?').run(storeId);
            }

            const checkProductStmt = db.prepare('SELECT id, is_service, image_path, sku FROM products WHERE store_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?))');
            const insertProductStmt = db.prepare(`
                INSERT INTO products (store_id, name, description, price, category, duration, is_service, image_path, available, sku, prices_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const updateProductStmt = db.prepare(`
                UPDATE products 
                SET price = ?, description = ?, category = ?, duration = ?, is_service = ?, 
                    image_path = CASE 
                        WHEN ? IS NOT NULL AND ? != '' THEN ? 
                        ELSE image_path 
                    END, 
                    available = ?, 
                    sku = CASE 
                        WHEN ? IS NOT NULL AND ? != '' THEN ? 
                        ELSE sku 
                    END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND store_id = ?
            `);

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const rowNum = i + 2; // Fila 1 es header

                const rawName = row[columnMapping.name];
                if (!rawName || !String(rawName).trim()) {
                    skipped++;
                    continue; // Ignorar filas sin nombre
                }

                const name = String(rawName).trim();
                const price = this.cleanPrice(row[columnMapping.price]);

                const description = columnMapping.description && row[columnMapping.description] !== undefined 
                    ? String(row[columnMapping.description]).trim() 
                    : '';

                const rawCat = columnMapping.category && row[columnMapping.category] !== undefined
                    ? String(row[columnMapping.category]).trim()
                    : 'General';
                const category = rawCat || 'General';
                categories.add(category);

                // Determinar si es servicio
                let isService = 0;
                if (columnMapping.is_service && row[columnMapping.is_service] !== undefined) {
                    const val = String(row[columnMapping.is_service]).toLowerCase().trim();
                    isService = (val === 'si' || val === 'sí' || val === 'true' || val === '1' || val === 'servicio' || val === 'service') ? 1 : 0;
                }

                // Duración
                let duration = 30;
                if (columnMapping.duration && row[columnMapping.duration] !== undefined) {
                    const dNum = parseInt(row[columnMapping.duration]);
                    if (!isNaN(dNum) && dNum > 0) duration = dNum;
                }

                // Disponibilidad
                let available = 1;
                if (columnMapping.available && row[columnMapping.available] !== undefined) {
                    const aVal = String(row[columnMapping.available]).toLowerCase().trim();
                    available = (aVal === 'no' || aVal === 'false' || aVal === '0' || aVal === 'agotado' || aVal === 'pausado') ? 0 : 1;
                }

                // Imagen (con normalización para Google Drive y protección contra sobreescritura con vacío)
                const imageCol = columnMapping.image_path || columnMapping.image || columnMapping.foto || columnMapping.imagen;
                const rawImage = imageCol && row[imageCol] !== undefined
                    ? String(row[imageCol]).trim()
                    : null;
                const imagePath = this.normalizeImageUrl(rawImage);

                // SKU / Código de producto
                const skuCol = columnMapping.sku || columnMapping.codigo || columnMapping.code;
                const rawSku = skuCol && row[skuCol] !== undefined
                    ? String(row[skuCol]).trim()
                    : '';

                try {
                    if (syncMode === 'replace') {
                        insertProductStmt.run(storeId, name, description, price, category, duration, isService, imagePath, available, rawSku, '[]');
                        inserted++;
                    } else {
                        // Modo upsert: preserva foto o sku si la celda viene vacía
                        const existing = checkProductStmt.get(storeId, name);
                        if (existing) {
                            updateProductStmt.run(
                                price, 
                                description, 
                                category, 
                                duration, 
                                isService, 
                                imagePath, imagePath, imagePath, 
                                available, 
                                rawSku, rawSku, rawSku, 
                                existing.id, 
                                storeId
                            );
                            updated++;
                        } else {
                            insertProductStmt.run(storeId, name, description, price, category, duration, isService, imagePath, available, rawSku, '[]');
                            inserted++;
                        }
                    }
                } catch (rowErr) {
                    errors.push(`Fila ${rowNum} (${name}): ${rowErr.message}`);
                }
            }

            // Actualizar categorías en Store
            const updatedCategories = Array.from(categories);
            db.prepare('UPDATE stores SET categories = ? WHERE id = ?').run(JSON.stringify(updatedCategories), storeId);

            // Guardar configuración de sincronización en la tienda
            const nowIso = new Date().toISOString();
            Store.update(storeId, {
                google_sheet_url: sheetUrl,
                google_sheet_mapping: columnMapping,
                google_sheet_sync_mode: syncMode,
                google_sheet_last_sync: nowIso
            });
        });

        runSync();

        return {
            success: true,
            totalRows: rows.length,
            inserted,
            updated,
            skipped,
            errors,
            lastSync: new Date().toISOString()
        };
    }
}

module.exports = GoogleSheetsService;

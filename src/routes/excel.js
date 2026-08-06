const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const Product = require('../models/Product');
const { requireAuth } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../config/db');
// Configurar multer para subir archivos Excel
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', '..', 'data', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'excel-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv',
            'text/tab-separated-values'
        ];
        if (allowedMimes.includes(file.mimetype) || 
            file.originalname.match(/\.(xlsx|xls|csv|tsv)$/i)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de archivo no soportado. Use archivos Excel (.xlsx, .xls) o CSV.'), false);
        }
    },
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

/**
 * POST /api/excel/preview
 * Previsualizar datos del archivo Excel antes de importar.
 */
router.post('/preview', requireAuth, upload.single('excelFile'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No se subió ningún archivo' });
        }

        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Convertir a JSON con headers de la primera fila
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        if (data.length < 2) {
            return res.status(400).json({ 
                success: false, 
                error: 'El archivo está vacío o no tiene datos suficientes' 
            });
        }

        // Primera fila como headers
        const headers = data[0].map(h => String(h || '').trim());
        const rows = data.slice(1).filter(row => row.some(cell => cell !== null && cell !== undefined && cell !== ''));
        
        res.json({
            success: true,
            filename: req.file.filename,
            originalname: req.file.originalname,
            sheetName,
            headers,
            totalRows: rows.length,
            preview: rows.slice(0, 10) // Primeras 10 filas para preview
        });
    } catch (error) {
        console.error('Error previewing Excel:', error);
        res.status(500).json({ success: false, error: 'Error al procesar el archivo Excel' });
    } finally {
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch (e) {}
        }
    }
});

/**
 * POST /api/excel/import
 * Importar productos desde Excel/CSV.
 * Body esperado:
 *   - columnMapping: { name: "col_name", price: "col_price", description: "col_desc", category: "col_cat" }
 *   - filename: nombre del archivo a procesar (debe estar en data/uploads/)
 */
router.post('/import', requireAuth, (req, res) => {
    try {
        const { columnMapping, filename } = req.body;
        
        if (!columnMapping || !columnMapping.name || !columnMapping.price) {
            return res.status(400).json({ 
                success: false, 
                error: 'Mapeo de columnas requerido (name y price son obligatorios)' 
            });
        }

        // Buscar el archivo
        const uploadDir = path.join(__dirname, '..', '..', 'data', 'uploads');
        const filePath = path.join(uploadDir, filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Archivo no encontrado. Suba el archivo nuevamente.' 
            });
        }

        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);

        const storeId = req.user.store_id;
        const categories = new Set();
        let imported = 0;
        let skipped = 0;
        const errors = [];

        // Obtener categorías existentes
        const store = require('../models/Store').getById(storeId);
        try {
            const existingCats = JSON.parse(store.categories || '["General"]');
            existingCats.forEach(c => categories.add(typeof c === 'string' ? c : c.name || c));
        } catch (e) {
            categories.add('General');
        }

        const db = getDb();
        const importTransaction = db.transaction(() => {
            for (let i = 0; i < data.length; i++) {
                try {
                    const row = data[i];
                    const name = String(row[columnMapping.name] || '').trim();
                    const price = parseFloat(row[columnMapping.price]);
                    
                    // Saltar filas sin nombre o precio
                    if (!name || isNaN(price)) {
                        skipped++;
                        continue;
                    }

                    const description = columnMapping.description ? 
                        String(row[columnMapping.description] || '').trim() : '';
                    const category = columnMapping.category ? 
                        String(row[columnMapping.category] || '').trim() || 'General' : 'General';
                    
                    const is_service = columnMapping.is_service ? 
                        (String(row[columnMapping.is_service] || '').toLowerCase() === 'sí' || String(row[columnMapping.is_service] || '').toLowerCase() === 'si') : false;
                    
                    const duration = columnMapping.duration ? 
                        parseInt(row[columnMapping.duration]) || 30 : 30;

                    // Agregar categoría a la lista
                    if (category && category !== 'General') {
                        categories.add(category);
                    }

                    // Verificar si el producto ya existe por nombre
                    const existing = Product.getByName(storeId, name);
                    if (existing) {
                        // Actualizar precio si es diferente
                        if (existing.price !== price) {
                            Product.update(existing.id, { price });
                        }
                        skipped++;
                        continue;
                    }

                    // Crear producto nuevo
                    Product.create({
                        storeId,
                        name,
                        description,
                        price,
                        category,
                        is_service: is_service ? 1 : 0,
                        duration
                    });
                    imported++;
                } catch (e) {
                    errors.push(`Fila ${i + 2}: ${e.message}`);
                    skipped++;
                }
            }
        });

        // Ejecutar transacción
        importTransaction();

        // Actualizar categorías del store
        if (categories.size > 0) {
            const catsArray = Array.from(categories).map(c => ({ name: c }));
            require('../models/Store').update(storeId, { categories: catsArray });
        }

        // Limpiar archivo
        fs.unlinkSync(filePath);

        res.json({
            success: true,
            imported,
            skipped,
            errors: errors.slice(0, 10), // Primeros 10 errores
            totalRows: data.length,
            categories: Array.from(categories)
        });
    } catch (error) {
        console.error('Error importing Excel:', error);
        res.status(500).json({ success: false, error: 'Error al importar productos' });
    }
});

/**
 * POST /api/excel/export
 * Exportar productos a Excel/CSV.
 * Query params: format (xlsx, csv)
 */
router.get('/export', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const products = require('../models/Product').getByStoreId(storeId);
        
        // Preparar datos para exportar
        const data = products.map(p => ({
            'Nombre': p.name,
            'Descripción': p.description || '',
            'Precio': p.price,
            'Categoría': p.category,
            'Disponible': p.available ? 'Sí' : 'No',
            'Es Servicio': p.is_service ? 'Sí' : 'No',
            'Duración (min)': p.is_service ? (p.duration || 30) : ''
        }));

        // Crear workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        
        // Ajustar anchos de columna
        ws['!cols'] = [
            { wch: 30 },  // Nombre
            { wch: 50 },  // Descripción
            { wch: 10 },  // Precio
            { wch: 20 },  // Categoría
            { wch: 10 },  // Disponible
            { wch: 15 },  // Es Servicio
            { wch: 15 }   // Duración
        ];
        
        XLSX.utils.book_append_sheet(wb, ws, 'Productos');

        const format = req.query.format || 'xlsx';
        const storeName = require('../models/Store').getById(storeId).name || 'productos';
        
        if (format === 'csv') {
            const csv = XLSX.utils.sheet_to_csv(ws);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${storeName}_productos.csv"`);
            res.send('\uFEFF' + csv); // BOM para Excel en español
        } else {
            const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${storeName}_productos.xlsx"`);
            res.send(buffer);
        }
    } catch (error) {
        console.error('Error exporting Excel:', error);
        res.status(500).json({ success: false, error: 'Error al exportar productos' });
    }
});

/**
 * GET /api/excel/reports
 * Exportar reporte financiero y operativo a CSV/Excel
 */
router.get('/reports', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const ReportService = require('../services/ReportService');
        const csvData = ReportService.exportToCsv(storeId);

        const storeName = require('../models/Store').getById(storeId).name || 'tienda';
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${storeName}_reporte_financiero.csv"`);
        res.send('\uFEFF' + csvData);
    } catch (error) {
        console.error('Error exportando reporte financiero:', error);
        res.status(500).json({ success: false, error: 'Error al exportar reporte' });
    }
});

module.exports = router;

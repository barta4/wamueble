const express = require('express');
const router = express.Router();
const GoogleSheetsService = require('../services/GoogleSheetsService');
const Store = require('../models/Store');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /api/sheets/config
 * Retorna la configuración actual guardada de Google Sheets para la tienda.
 */
router.get('/config', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const store = Store.getById(storeId);
        if (!store) {
            return res.status(404).json({ success: false, error: 'Tienda no encontrada' });
        }

        let mapping = null;
        if (store.google_sheet_mapping) {
            try {
                mapping = JSON.parse(store.google_sheet_mapping);
            } catch (e) {
                mapping = null;
            }
        }

        res.json({
            success: true,
            sheetUrl: store.google_sheet_url || '',
            mapping: mapping,
            syncMode: store.google_sheet_sync_mode || 'upsert',
            lastSync: store.google_sheet_last_sync || null
        });
    } catch (error) {
        console.error('Error al obtener configuración de Google Sheets:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/sheets/preview
 * Descarga y previsualiza las columnas y primeras 10 filas de una planilla de Google Sheets.
 * Body: { sheetUrl: "https://docs.google.com/spreadsheets/d/..." }
 */
router.post('/preview', requireAuth, async (req, res) => {
    try {
        const { sheetUrl } = req.body;
        if (!sheetUrl) {
            return res.status(400).json({ success: false, error: 'URL de Google Sheets requerida' });
        }

        const data = await GoogleSheetsService.fetchSheetData(sheetUrl);
        const suggestedMapping = GoogleSheetsService.autoDetectMapping(data.headers);

        res.json({
            success: true,
            headers: data.headers,
            totalRows: data.totalRows,
            sampleRows: data.rows.slice(0, 10),
            suggestedMapping,
            spreadsheetId: data.spreadsheetId,
            gid: data.gid
        });
    } catch (error) {
        console.error('Error al previsualizar Google Sheet:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/sheets/import
 * Sincroniza e importa productos desde Google Sheets con mapeo de columnas especificado.
 * Body: { sheetUrl, columnMapping, syncMode }
 */
router.post('/import', requireAuth, async (req, res) => {
    try {
        const storeId = req.user.store_id;
        const { sheetUrl, columnMapping, syncMode } = req.body;

        if (!sheetUrl) {
            return res.status(400).json({ success: false, error: 'URL de Google Sheets requerida' });
        }

        if (!columnMapping || !columnMapping.name || !columnMapping.price) {
            return res.status(400).json({ 
                success: false, 
                error: 'Mapeo incompleto: Las columnas Nombre y Precio son obligatorias.' 
            });
        }

        const result = await GoogleSheetsService.syncProducts(storeId, {
            sheetUrl,
            columnMapping,
            syncMode: syncMode || 'upsert'
        });

        res.json({
            success: true,
            message: `Sincronización completada: ${result.inserted} agregados, ${result.updated} actualizados de ${result.totalRows} filas.`,
            ...result
        });
    } catch (error) {
        console.error('Error al importar desde Google Sheet:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/sheets/quick-sync
 * Sincronización rápida en 1 clic utilizando la última configuración guardada de la tienda.
 */
router.post('/quick-sync', requireAuth, async (req, res) => {
    try {
        const storeId = req.user.store_id;
        const store = Store.getById(storeId);
        if (!store || !store.google_sheet_url) {
            return res.status(400).json({ 
                success: false, 
                error: 'No hay ninguna planilla de Google Sheets vinculada aún. Configurá la URL primero.' 
            });
        }

        let mapping = null;
        if (store.google_sheet_mapping) {
            try { mapping = JSON.parse(store.google_sheet_mapping); } catch(e) {}
        }

        if (!mapping || !mapping.name || !mapping.price) {
            return res.status(400).json({ 
                success: false, 
                error: 'No se encontró un mapeo de columnas guardado. Por favor, realizá la vinculación inicial con previsualización.' 
            });
        }

        const result = await GoogleSheetsService.syncProducts(storeId, {
            sheetUrl: store.google_sheet_url,
            columnMapping: mapping,
            syncMode: store.google_sheet_sync_mode || 'upsert'
        });

        res.json({
            success: true,
            message: `Sincronización rápida exitosa: ${result.inserted} agregados, ${result.updated} actualizados.`,
            ...result
        });
    } catch (error) {
        console.error('Error en sincronización rápida de Google Sheet:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;

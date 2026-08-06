const express = require('express');
const router = express.Router();
const Campaign = require('../models/Campaign');
const CampaignService = require('../services/CampaignService');
const WhatsAppManager = require('../services/whatsapp');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /api/campaigns/templates
 * Sincronizar plantillas oficiales aprobadas por Meta para esta tienda
 */
router.get('/templates', requireAuth, async (req, res) => {
    try {
        const storeId = req.user.store_id;
        const provider = WhatsAppManager.getProvider(storeId);
        if (!provider || typeof provider.fetchTemplates !== 'function') {
            return res.json({ templates: [], metaActive: false, message: 'La tienda debe usar Meta Cloud API para sincronizar plantillas oficiales.' });
        }

        const templates = await provider.fetchTemplates();
        res.json({ templates, metaActive: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/campaigns
 * Listar campañas de la tienda
 */
router.get('/', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const campaigns = Campaign.getByStoreId(storeId);
        res.json(campaigns);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/campaigns
 * Crear una nueva campaña de difusión
 */
router.post('/', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const { name, templateName, languageCode, parametersMapping } = req.body;

        if (!name || !templateName) {
            return res.status(400).json({ error: 'Nombre de campaña y nombre de plantilla son requeridos.' });
        }

        const campaign = Campaign.create({
            storeId,
            name,
            templateName,
            languageCode: languageCode || 'es',
            parametersMapping: parametersMapping || []
        });

        res.status(201).json(campaign);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/campaigns/:id/launch
 * Lanzar envío de campaña en lotes seguros
 */
router.post('/:id/launch', requireAuth, async (req, res) => {
    try {
        const storeId = req.user.store_id;
        const campaignId = parseInt(req.params.id);

        const result = await CampaignService.launchCampaign(campaignId, storeId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

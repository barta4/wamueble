const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const PlanEnforcer = require('../services/planEnforcer');
const { getAllPlans, getPlan } = require('../config/plans');
const Store = require('../models/Store');

/**
 * GET /api/billing/plans
 * Obtener todos los planes disponibles.
 */
router.get('/plans', (req, res) => {
    res.json(getAllPlans());
});

/**
 * GET /api/billing/current
 * Obtener el plan actual del usuario.
 */
router.get('/current', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const usage = PlanEnforcer.getUsage(storeId);
        const store = Store.getById(storeId);
        
        res.json({
            ...usage,
            storeId,
            planExpiresAt: store.plan_expires_at
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/billing/usage
 * Obtener uso actual de límites.
 */
router.get('/usage', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const usage = PlanEnforcer.getUsage(storeId);
        res.json(usage);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/billing/upgrade
 * Cambiar de plan (simulado - en producción integraría con Stripe/PayPal).
 */
router.post('/upgrade', requireAuth, (req, res) => {
    try {
        const storeId = req.user.store_id;
        const { plan } = req.body;

        if (!plan) {
            return res.status(400).json({ error: 'Plan requerido' });
        }

        const { isValidPlan } = require('../config/plans');
        if (!isValidPlan(plan)) {
            return res.status(400).json({ error: 'Plan inválido' });
        }

        // Actualizar plan del store
        Store.update(storeId, { plan });

        // Actualizar plan del usuario
        const User = require('../models/User');
        User.update(req.user.id, { plan });

        res.json({ 
            success: true, 
            message: `Plan cambiado a ${getPlan(plan).name}`,
            plan: getPlan(plan)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

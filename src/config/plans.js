/**
 * Definición de planes para WaBot SaaS.
 * Cada plan define límites y características disponibles.
 */

const PLANS = {
    free: {
        id: 'free',
        name: 'Gratis',
        price: 0,
        currency: 'USD',
        interval: 'month',
        description: 'Para probar el sistema',
        features: [
            '100 pedidos/mes',
            '20 productos',
            '1 repartidor',
            '1 número WhatsApp',
            'Soporte IA básico',
            'Dashboard de cocina'
        ],
        limits: {
            ordersPerMonth: 100,
            products: 20,
            drivers: 1,
            whatsappNumbers: 1,
            dbConnections: false,
            multiStore: false,
            apiAccess: false,
            customBranding: false,
            prioritySupport: false
        }
    },
    pro: {
        id: 'pro',
        name: 'Pro',
        price: 29,
        currency: 'USD',
        interval: 'month',
        description: 'Para negocios en crecimiento',
        features: [
            'Pedidos ilimitados',
            '500 productos',
            '10 repartidores',
            '1 número WhatsApp',
            'Soporte IA premium',
            'Conexión BD externa',
            'Historial completo',
            'Reportes avanzados'
        ],
        limits: {
            ordersPerMonth: -1, // ilimitado
            products: 500,
            drivers: 10,
            whatsappNumbers: 1,
            dbConnections: true,
            multiStore: false,
            apiAccess: false,
            customBranding: false,
            prioritySupport: false
        }
    },
    enterprise: {
        id: 'enterprise',
        name: 'Enterprise',
        price: 99,
        currency: 'USD',
        interval: 'month',
        description: 'Para grandes operaciones',
        features: [
            'Todo de Pro incluido',
            'Productos ilimitados',
            'Repartidores ilimitados',
            '3 números WhatsApp',
            'Multi-sucursal',
            'API access',
            'Soporte prioritario',
            'Branding personalizado'
        ],
        limits: {
            ordersPerMonth: -1,
            products: -1,
            drivers: -1,
            whatsappNumbers: 3,
            dbConnections: true,
            multiStore: true,
            apiAccess: true,
            customBranding: true,
            prioritySupport: true
        }
    }
};

/**
 * Obtener configuración de un plan por ID.
 */
function getPlan(planId) {
    return PLANS[planId] || PLANS.free;
}

/**
 * Obtener todos los planes.
 */
function getAllPlans() {
    return Object.values(PLANS);
}

/**
 * Verificar si un plan es válido.
 */
function isValidPlan(planId) {
    return PLANS.hasOwnProperty(planId);
}

module.exports = { PLANS, getPlan, getAllPlans, isValidPlan };

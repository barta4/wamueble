const User = require('../models/User');

/**
 * Middleware: Requiere usuario autenticado.
 */
function getAuthenticatedUser(req) {
    if (req.session && req.session.userId) {
        const user = User.getById(req.session.userId);
        if (user) {
            // Si el usuario especifica un storeId en sesión (ej. superadmin navegando un local), respetarlo
            if (req.session.storeId && user.role === 'superadmin') {
                user.store_id = req.session.storeId;
            }
            return user;
        }
    }
    return null;
}

/**
 * Middleware: Requiere usuario autenticado.
 */
function requireAuth(req, res, next) {
    const user = getAuthenticatedUser(req);
    if (user) {
        req.user = user;
        req.session.storeId = user.store_id;
        return next();
    }
    
    // Si es petición API, devolver 401
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'No autorizado' });
    }
    
    // Si es página web, redirigir a login
    res.redirect('/login');
}

/**
 * Middleware: Requiere super-admin.
 */
function requireSuperAdmin(req, res, next) {
    const user = getAuthenticatedUser(req);
    if (user && user.role === 'superadmin') {
        req.user = user;
        return next();
    }
    
    if (req.path.startsWith('/api/')) {
        return res.status(403).json({ error: 'Acceso denegado' });
    }
    
    res.redirect('/dashboard');
}

/**
 * Middleware: Inyectar storeId del usuario en la request.
 */
function injectStoreId(req, res, next) {
    const user = getAuthenticatedUser(req);
    if (user) {
        req.user = user;
        req.storeId = user.store_id;
    }
    next();
}

/**
 * Middleware: Verificar que el usuario tiene un plan activo.
 */
function requireActivePlan(req, res, next) {
    if (!req.user) {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'No autorizado' });
        }
        return res.redirect('/login');
    }
    
    // Super-admin siempre pasa
    if (req.user.role === 'superadmin') return next();
    
    // Verificar si el plan tiene fecha de expiración
    if (req.user.plan_expires_at) {
        const expiresAt = new Date(req.user.plan_expires_at);
        if (expiresAt < new Date()) {
            if (req.path.startsWith('/api/')) {
                return res.status(403).json({ error: 'Plan expirado', upgrade: true });
            }
            return res.redirect('/pricing?expired=1');
        }
    }
    
    next();
}

module.exports = { requireAuth, requireSuperAdmin, injectStoreId, requireActivePlan };

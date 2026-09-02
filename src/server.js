require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
const SQLiteStore = require('better-sqlite3-session-store')(session);
const { getDb, runSeed } = require('./config/db');
const logger = require('./utils/logger');
const { validateEnv } = require('./config/env');

// ─── Validar Entorno al Arranque ────────────────────────
validateEnv();

// ─── Inicializar Express ───────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: process.env.CORS_ORIGIN || '*' }
});

// ─── Inicializar BD ────────────────────────────────────
const db = getDb();

// ─── Middlewares ────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: false
}));
app.use(cors());
app.use(express.json({ 
    limit: '50mb',
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const sessionSecret = process.env.SESSION_SECRET || 'wabot_dev_secret';

const sessionMiddleware = session({
    store: new SQLiteStore({
        client: db,
        expired: {
            clear: true,
            intervalMs: 900000 // 15 minutos
        }
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 días
});

app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);

// ─── View Engine ────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/media', express.static(path.join(__dirname, '..', 'data', 'media')));

// ─── Hacer io accesible en las rutas ────────────────────
app.set('io', io);

// ─── Rutas ──────────────────────────────────────────────
const authRoutes = require('./routes/auth');
const billingRoutes = require('./routes/billing');
const webhookRoutes = require('./routes/webhook');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const driverRoutes = require('./routes/drivers');
const chatRoutes = require('./routes/chats');
const dashboardRoutes = require('./routes/dashboard');
const whatsappConfigRoutes = require('./routes/whatsapp-config');
const customerRoutes = require('./routes/customers');
const dbConnectRoutes = require('./routes/dbConnect');
const superadminRoutes = require('./routes/superadmin');
const appointmentRoutes = require('./routes/appointments');
const roomRoutes = require('./routes/rooms');
const bookingRoutes = require('./routes/bookings');
const excelRoutes = require('./routes/excel');
const sheetsRoutes = require('./routes/sheets');
const campaignRoutes = require('./routes/campaigns');
const paymentRoutes = require('./routes/payments');

// Públicas (no requieren auth)
app.use('/', authRoutes);

// Protegidas (requieren auth)
app.use('/webhook', webhookRoutes);
app.use('/api/billing', billingRoutes);

app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/whatsapp', whatsappConfigRoutes);
app.use('/api/db-connect', dbConnectRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/excel', excelRoutes);
app.use('/api/sheets', sheetsRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/superadmin', superadminRoutes);
app.use('/', dashboardRoutes);

// ─── WebSockets ─────────────────────────────────────────
const setupPedidosSockets = require('./sockets/pedidos');
setupPedidosSockets(io);

// ─── Health Check ───────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Error Handler Centralizado ─────────────────────────
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const isOperational = err.isOperational || false;

    logger.error({
        err,
        statusCode,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip
    }, err.message || 'Error no controlado en la aplicación');

    if (res.headersSent) {
        return next(err);
    }

    const isProduction = process.env.NODE_ENV === 'production';

    res.status(statusCode).json({
        error: isOperational || !isProduction ? err.message : 'Error interno del servidor',
        code: err.errorCode || 'INTERNAL_ERROR',
        ...(err.details ? { details: err.details } : {}),
        ...(!isProduction && !isOperational ? { stack: err.stack } : {})
    });
});

// ─── Iniciar Servidor ───────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    logger.info({
        port: PORT,
        landing: `http://localhost:${PORT}/`,
        dashboard: `http://localhost:${PORT}/pedidos`,
        admin: `http://localhost:${PORT}/admin`,
        webhook: `http://localhost:${PORT}/webhook`,
        health: `http://localhost:${PORT}/health`
    }, `🤖 WaBot SaaS corriendo en puerto ${PORT}`);
    
    // Inicializar PostgreSQL si está activado en entorno
    if (process.env.USE_POSTGRES === 'true' || process.env.DATABASE_URL) {
        const { initPgSchema } = require('./config/postgres');
        initPgSchema().catch(e => logger.error({ err: e }, "Error init PG schema"));
    }

    // Inicializar Cola de Mensajes Persistente (Queue Worker)
    const QueueService = require('./services/QueueService');
    QueueService.startWorker(io);

    // Inicializar Motor de Automatizaciones y Seguimiento Post-Atención
    const FollowUpService = require('./services/FollowUpService');
    FollowUpService.startWorker();

    // Inicializar WhatsApp
    const WhatsAppManager = require('./services/whatsapp');
    WhatsAppManager.initialize(io);
});

// ─── Handlers de Proceso & Graceful Shutdown ────────────
process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Excepción no capturada (uncaughtException). Cerrando proceso...');
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error({ reason }, 'Promesa rechazada no controlada (unhandledRejection).');
});

const gracefulShutdown = (signal) => {
    logger.info(`Señal ${signal} recibida. Iniciando cierre seguro (Graceful Shutdown)...`);
    server.close(() => {
        logger.info('Servidor HTTP cerrado.');
        process.exit(0);
    });

    setTimeout(() => {
        logger.error('Forzando cierre por tiempo de espera en Graceful Shutdown...');
        process.exit(1);
    }, 10000);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

module.exports = { app, server, io };

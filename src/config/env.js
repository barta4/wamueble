const logger = require('../utils/logger');

/**
 * Valida la configuración de variables de entorno al arranque.
 * Aplica el principio Fail-Fast si faltan configuraciones críticas en producción.
 */
function validateEnv() {
    const isProduction = process.env.NODE_ENV === 'production';
    const sessionSecret = process.env.SESSION_SECRET;

    if (isProduction && (!sessionSecret || sessionSecret === 'wabot_dev_secret')) {
        const errorMsg = 'FATAL: SESSION_SECRET es obligatoria y debe ser segura en entorno de producción.';
        logger.error(errorMsg);
        throw new Error(errorMsg);
    }

    logger.info({
        env: process.env.NODE_ENV || 'development',
        port: process.env.PORT || 3001,
        usePostgres: process.env.USE_POSTGRES === 'true' || Boolean(process.env.DATABASE_URL)
    }, 'Configuración de entorno verificada correctamente.');
}

module.exports = { validateEnv };

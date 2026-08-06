const pino = require('pino');

const isProduction = process.env.NODE_ENV === 'production';

const logger = pino({
    level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
    base: isProduction ? { pid: process.pid } : undefined,
    timestamp: pino.stdTimeFunctions.isoTime
});

module.exports = logger;

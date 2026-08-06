/**
 * Wrapper para funciones de controlador asíncronas en Express.
 * Captura excepciones no controladas en promesas y las reenvía a next().
 *
 * @param {Function} fn - Función controladora asíncrona (req, res, next)
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;

/**
 * Clase base para errores operacionales conocidos en la aplicación.
 */
class AppError extends Error {
    constructor(message, statusCode = 500, errorCode = 'INTERNAL_ERROR') {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

class ValidationError extends AppError {
    constructor(message = 'Datos de entrada inválidos', details = null) {
        super(message, 400, 'VALIDATION_ERROR');
        this.details = details;
    }
}

class UnauthorizedError extends AppError {
    constructor(message = 'No autorizado / Autenticación requerida') {
        super(message, 401, 'UNAUTHORIZED');
    }
}

class ForbiddenError extends AppError {
    constructor(message = 'Acceso prohibido / Permisos insuficientes') {
        super(message, 403, 'FORBIDDEN');
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Recurso no encontrado') {
        super(message, 404, 'NOT_FOUND');
    }
}

class ConflictError extends AppError {
    constructor(message = 'Conflicto con el estado actual del recurso') {
        super(message, 409, 'CONFLICT');
    }
}

module.exports = {
    AppError,
    ValidationError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    ConflictError
};

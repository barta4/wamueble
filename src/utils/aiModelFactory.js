const { ChatOpenAI } = require('@langchain/openai');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { ChatAnthropic } = require('@langchain/anthropic');

/**
 * Verifica si un proveedor de IA tiene una API key configurada y válida.
 * @param {string} provider - 'openai', 'gemini' / 'google', 'anthropic' / 'claude'
 * @param {string} [customApiKey] - Clave personalizada opcional del tenant
 * @returns {boolean} true si tiene token válido
 */
function hasValidToken(provider, customApiKey = null) {
    if (customApiKey && customApiKey.trim().length > 5) {
        return true;
    }
    const prov = (provider || '').toLowerCase();
    switch (prov) {
        case 'gemini':
        case 'google':
            return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '');

        case 'anthropic':
        case 'claude':
            return Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim() !== '');

        case 'openai':
        default:
            return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim() !== '');
    }
}

/**
 * Retorna la lista de proveedores con su estado de validez de token.
 * @param {string} [customApiKey]
 * @returns {Array<{id: string, name: string, active: boolean}>}
 */
function getAvailableProviders(customApiKey = null) {
    return [
        { id: 'openai', name: 'OpenAI (GPT-4o)', active: hasValidToken('openai', customApiKey) },
        { id: 'gemini', name: 'Google Gemini (Gemini 2.0 Flash)', active: hasValidToken('gemini', customApiKey) },
        { id: 'anthropic', name: 'Anthropic (Claude Sonnet 4)', active: hasValidToken('anthropic', customApiKey) }
    ];
}

/**
 * Resuelve el proveedor a utilizar. Si el solicitado no tiene token válido,
 * selecciona automáticamente el primero que contenga tokens válidos (Default resiliente).
 * @param {string} requestedProvider
 * @param {string} [customApiKey]
 * @returns {string} ID del proveedor resuelto ('openai', 'gemini', 'anthropic')
 */
function resolveValidProvider(requestedProvider, customApiKey = null) {
    const req = (requestedProvider || '').toLowerCase();
    
    // Si el proveedor solicitado tiene token válido, usarlo
    if (hasValidToken(req, customApiKey)) {
        return req === 'claude' ? 'anthropic' : (req === 'google' ? 'gemini' : req);
    }

    // Si el solicitado no tiene token válido, seleccionar automáticamente el primero con token válido
    const available = getAvailableProviders(customApiKey).find(p => p.active);
    if (available) {
        console.warn(`⚠️ Proveedor de IA solicitado '${requestedProvider}' no tiene token válido. Seleccionando automáticamente '${available.id}' por defecto.`);
        return available.id;
    }

    // Fallback por defecto
    return 'openai';
}

/**
 * Fábrica centralizada de modelos de Chat de LangChain.
 * Mapea el proveedor y retorna la instancia configurada.
 * 
 * @param {string} provider - El proveedor de IA ('openai', 'gemini'/'google', 'claude'/'anthropic')
 * @param {string} [customApiKey] - Clave API opcional por tenant
 * @returns {object} Instancia del modelo de chat de LangChain
 */
function createModel(provider, customApiKey = null) {
    const resolvedProv = resolveValidProvider(provider, customApiKey);

    switch (resolvedProv) {
        case 'gemini':
        case 'google':
            return new ChatGoogleGenerativeAI({
                model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
                temperature: 0.3,
                apiKey: customApiKey || process.env.GEMINI_API_KEY,
            });

        case 'anthropic':
        case 'claude':
            return new ChatAnthropic({
                model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
                temperature: 0.3,
                anthropicApiKey: customApiKey || process.env.ANTHROPIC_API_KEY,
            });

        case 'openai':
        default:
            return new ChatOpenAI({
                modelName: process.env.OPENAI_MODEL || 'gpt-4o',
                temperature: 0.3,
                openAIApiKey: customApiKey || process.env.OPENAI_API_KEY,
            });
    }
}

module.exports = {
    createModel,
    hasValidToken,
    getAvailableProviders,
    resolveValidProvider
};

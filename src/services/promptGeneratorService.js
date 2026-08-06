const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { createModel } = require('../utils/aiModelFactory');

const META_PROMPT = `Eres un experto en Prompt Engineering y atención al cliente por WhatsApp para negocios.
Tu objetivo es tomar la información básica de un comercio y generar el PROMPT DE SISTEMA PERFECTO en español para su asistente de Inteligencia Artificial.

El prompt generado debe ser profesional, conciso y estar dividido claramente en las siguientes secciones usando formato limpio:

1. 🤖 ROL Y PERSONALIDAD:
- Nombre del asistente y tono de voz (según lo solicitado).
- Uso estratégico de emojis (acorde al rubro).

2. 🎯 OBJETIVO PRINCIPAL:
- Ayudar a los clientes, tomar pedidos/citas/reservas y resolver dudas comerciales.

3. 📌 REGLAS DE NEGOCIO Y POLÍTICAS:
- Horarios de atención.
- Formas de pago aceptadas.
- Políticas de envíos/cobertura o reservas.

4. ⚠️ LÍMITES Y DERIVACIÓN A HUMANO:
- Indicación de que si el cliente solicita algo que no sabe o tiene un reclamo, responda amablemente y lo derive a un operador humano.

5. 📱 REGLAS DE FORMATO EN WHATSAPP:
- Mensajes breves (máximo 2 a 3 párrafos cortos).
- Usar viñetas o listas para fácil lectura en móviles.

IMPORTANTE: Devuelve ÚNICAMENTE el texto final del Prompt de Sistema generado, sin introducciones, comentarios ni explicaciones adicionales.`;

const PromptGeneratorService = {
    /**
     * Generar un Prompt de Sistema optimizado para un negocio.
     * @param {Object} data - { description, tone, rules, businessType }
     * @returns {Promise<string>} Prompt redactado por la IA
     */
    async generatePrompt({ description, tone = 'amigable', rules = '', businessType = 'general' }) {
        try {
            const model = createModel(process.env.AI_PROVIDER || 'openai');

            const userContent = `INFORMACIÓN DEL NEGOCIO:
- Tipo de Negocio: ${businessType}
- Descripción / Productos: ${description || 'Negocio comercial'}
- Tono de voz deseado: ${tone}
- Reglas / Políticas especiales: ${rules || 'Atención estándar'}`;

            const messages = [
                new SystemMessage(META_PROMPT),
                new HumanMessage(userContent)
            ];

            const response = await model.invoke(messages);
            return response.content ? response.content.trim() : '';
        } catch (error) {
            console.error("❌ Error en PromptGeneratorService:", error.message);
            throw new Error(`Error al generar el prompt con IA: ${error.message}`);
        }
    }
};

module.exports = PromptGeneratorService;

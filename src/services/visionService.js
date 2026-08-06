/**
 * Servicio de Análisis Visual (Vision)
 * Analiza imágenes usando el proveedor de IA configurado (OpenAI GPT-4o, Gemini Vision, Anthropic Claude).
 * Permite al bot "ver" fotos enviadas por clientes.
 */

const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { createModel } = require('../utils/aiModelFactory');

class VisionService {
    constructor() {
        this.provider = (process.env.AI_PROVIDER || 'openai').toLowerCase();
        this.model = this._createModel();
        console.log(`👁️  Vision Service inicializado con proveedor: ${this.provider}`);
    }

    /**
     * Crear instancia del modelo con soporte de visión.
     */
    _createModel() {
        return createModel(this.provider);
    }

    /**
     * Analizar una imagen y devolver una descripción.
     * 
     * @param {string} base64Image - Imagen en formato base64
     * @param {string} prompt - Pregunta/instrucción sobre la imagen
     * @param {string} mimeType - Tipo MIME de la imagen (default: image/jpeg)
     * @returns {Promise<string>} Descripción de la imagen
     */
    async analyzeImage(base64Image, prompt = 'Describe esta imagen en detalle. Si es un producto de un menú o catálogo, indica su nombre, precio visible y cualquier detalle relevante.', mimeType = 'image/jpeg') {
        try {
            let response;

            switch (this.provider) {
                case 'gemini':
                case 'google':
                    response = await this._analyzeWithGemini(base64Image, prompt, mimeType);
                    break;

                case 'anthropic':
                case 'claude':
                    response = await this._analyzeWithAnthropic(base64Image, prompt, mimeType);
                    break;

                case 'openai':
                default:
                    response = await this._analyzeWithOpenAI(base64Image, prompt, mimeType);
                    break;
            }

            console.log(`👁️  Análisis visual completado: "${response.substring(0, 100)}..."`);
            return response;

        } catch (error) {
            console.error(`❌ Error en análisis visual (${this.provider}):`, error.message);
            return null;
        }
    }

    /**
     * Analizar imagen con OpenAI GPT-4o Vision.
     */
    async _analyzeWithOpenAI(base64Image, prompt, mimeType) {
        const messages = [
            new SystemMessage('Eres un asistente visual que analiza imágenes de clientes de negocios. Describe lo que ves de forma clara y concisa.'),
            new HumanMessage({
                content: [
                    {
                        type: 'text',
                        text: prompt
                    },
                    {
                        type: 'image_url',
                        image_url: {
                            url: `data:${mimeType};base64,${base64Image}`,
                            detail: 'high'
                        }
                    }
                ]
            })
        ];

        const response = await this.model.invoke(messages);
        return response.content;
    }

    /**
     * Analizar imagen con Google Gemini Vision.
     */
    async _analyzeWithGemini(base64Image, prompt, mimeType) {
        const messages = [
            new SystemMessage('Eres un asistente visual que analiza imágenes de clientes de negocios. Describe lo que ves de forma clara y concisa.'),
            new HumanMessage({
                content: [
                    {
                        type: 'text',
                        text: prompt
                    },
                    {
                        type: 'image',
                        image: base64Image,
                        mimeType: mimeType
                    }
                ]
            })
        ];

        const response = await this.model.invoke(messages);
        return response.content;
    }

    /**
     * Analizar imagen con Anthropic Claude Vision.
     */
    async _analyzeWithAnthropic(base64Image, prompt, mimeType) {
        const messages = [
            new HumanMessage({
                content: [
                    {
                        type: 'text',
                        text: prompt
                    },
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: mimeType,
                            data: base64Image
                        }
                    }
                ]
            })
        ];

        const response = await this.model.invoke(messages);
        return response.content;
    }

}

// Singleton
let instance = null;

function getVisionService() {
    if (!instance) {
        instance = new VisionService();
    }
    return instance;
}

module.exports = { getVisionService };

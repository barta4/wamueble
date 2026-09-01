const axios = require('axios');

// Métricas de observabilidad en memoria para transcripciones de audio
const audioMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalLatencyMs: 0
};

/**
 * Servicio para transcripción de mensajes de audio.
 * Descarga el audio desde WhatsApp y lo envía a OpenAI Whisper con telemetría.
 */
class AudioService {
    /**
     * Transcribe un buffer de audio usando OpenAI Whisper.
     * 
     * @param {Buffer} audioBuffer - El buffer de audio a transcribir
     * @param {string} mimetype - El tipo MIME del audio
     * @returns {string|null} Texto transcrito
     */
    static async transcribeBuffer(audioBuffer, mimetype = 'audio/webm') {
        const startTime = Date.now();
        audioMetrics.totalRequests++;

        try {
            const FormData = require('form-data');
            const form = new FormData();

            // Determinar extensión del archivo
            const ext = mimetype.includes('ogg') ? 'ogg' : 
                        mimetype.includes('mp4') ? 'mp4' : 
                        mimetype.includes('mpeg') ? 'mp3' : 
                        mimetype.includes('webm') ? 'webm' : 'webm';

            form.append('file', audioBuffer, {
                filename: `audio.${ext}`,
                contentType: mimetype,
            });
            form.append('model', 'whisper-1');
            form.append('language', 'es');

            const whisperResponse = await axios.post(
                'https://api.openai.com/v1/audio/transcriptions',
                form,
                {
                    headers: {
                        ...form.getHeaders(),
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                    }
                }
            );

            const elapsedMs = Date.now() - startTime;
            audioMetrics.successfulRequests++;
            audioMetrics.totalLatencyMs += elapsedMs;

            const transcription = whisperResponse.data.text;
            console.log(`🎤 [Audio Telemetry] Audio transcrito exitosamente en ${elapsedMs}ms (${(audioBuffer.length / 1024).toFixed(1)} KB): "${transcription.substring(0, 60)}..."`);
            return transcription;

        } catch (error) {
            const elapsedMs = Date.now() - startTime;
            audioMetrics.failedRequests++;
            audioMetrics.totalLatencyMs += elapsedMs;

            const errorDetail = error.response ? JSON.stringify(error.response.data) : error.message;
            console.error(`❌ [Audio Error] Falló transcripción de audio tras ${elapsedMs}ms:`, errorDetail);
            return null;
        }
    }

    /**
     * Transcribe un audio en formato base64 usando OpenAI Whisper.
     * 
     * @param {string} base64Audio - El audio en base64
     * @param {string} mimetype - El tipo MIME del audio (por defecto 'audio/ogg')
     * @returns {string|null} Texto transcrito
     */
    static async transcribeBase64(base64Audio, mimetype = 'audio/ogg') {
        try {
            const audioBuffer = Buffer.from(base64Audio, 'base64');
            return await this.transcribeBuffer(audioBuffer, mimetype);
        } catch (error) {
            console.error('❌ Error convirtiendo base64 para transcribir:', error.message);
            return null;
        }
    }

    /**
     * Obtener métricas agregadas de rendimiento de audio.
     */
    static getMetrics() {
        const avgLatency = audioMetrics.totalRequests > 0 
            ? Math.round(audioMetrics.totalLatencyMs / audioMetrics.totalRequests) 
            : 0;
        const successRate = audioMetrics.totalRequests > 0 
            ? ((audioMetrics.successfulRequests / audioMetrics.totalRequests) * 100).toFixed(1) + '%' 
            : '100%';

        return {
            ...audioMetrics,
            avgLatencyMs: avgLatency,
            successRate: successRate
        };
    }
}

module.exports = AudioService;

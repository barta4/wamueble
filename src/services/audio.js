const axios = require('axios');


/**
 * Servicio para transcripción de mensajes de audio.
 * Descarga el audio desde Evolution API y lo envía a OpenAI Whisper.
 */
class AudioService {
    /**
     * Transcribe un buffer de audio usando OpenAI Whisper.
     * 
     * @param {Buffer} audioBuffer - El buffer de audio a transcribir
     * @param {string} mimetype - El tipo MIME del audio
     * @returns {string} Texto transcrito
     */
    static async transcribeBuffer(audioBuffer, mimetype = 'audio/webm') {
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

            const transcription = whisperResponse.data.text;
            console.log(`🎤 Audio transcrito: "${transcription}"`);
            return transcription;

        } catch (error) {
            console.error('❌ Error transcribiendo audio (Whisper API):', error.response ? error.response.data : error.message);
            return null;
        }
    }

    /**
     * Transcribe un audio en formato base64 usando OpenAI Whisper.
     * 
     * @param {string} base64Audio - El audio en base64
     * @param {string} mimetype - El tipo MIME del audio (por defecto 'audio/ogg')
     * @returns {string} Texto transcrito
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

}

module.exports = AudioService;

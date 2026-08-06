const Campaign = require('../models/Campaign');
const Store = require('../models/Store');
const WhatsAppManager = require('./whatsapp');
const QueueService = require('./QueueService');

class CampaignService {
    /**
     * Lanzar una campaña de mensajes oficiales Meta Cloud en lotes seguros.
     */
    static async launchCampaign(campaignId, storeId) {
        const campaign = Campaign.getById(campaignId);
        if (!campaign) throw new Error('Campaña no encontrada');
        if (campaign.store_id !== storeId) throw new Error('Acceso denegado');
        if (campaign.status === 'processing' || campaign.status === 'completed') {
            throw new Error('La campaña ya fue procesada o está en ejecución');
        }

        const recipients = Campaign.getRecipients(campaignId);
        if (recipients.length === 0) {
            throw new Error('La campaña no tiene destinatarios en el CRM');
        }

        // Actualizar estado a processing
        Campaign.updateProgress(campaignId, 0, 0, 'processing');

        let mapping = [];
        try {
            mapping = JSON.parse(campaign.parameters_mapping || '[]');
        } catch(e) {}

        // Encolar los mensajes en el QueueService para envío gradual anti-spam
        for (const recipient of recipients) {
            const params = mapping.map(field => {
                if (field === 'customer_name') return recipient.customer_name || 'Cliente';
                if (field === 'store_name') {
                    const store = Store.getById(storeId);
                    return store ? store.name : 'UruBot';
                }
                return field;
            });

            const payload = {
                type: 'template',
                storeId,
                campaignId,
                recipientId: recipient.id,
                phone: recipient.customer_phone,
                templateName: campaign.template_name,
                languageCode: campaign.language_code || 'es',
                parameters: params
            };

            await QueueService.enqueue(payload);
        }

        return { success: true, message: `Campaña encolada para ${recipients.length} destinatarios.` };
    }
}

module.exports = CampaignService;

const { getDb } = require('../config/db');

class Campaign {
    static getById(id) {
        return getDb().prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
    }

    static getByStoreId(storeId) {
        return getDb().prepare('SELECT * FROM campaigns WHERE store_id = ? ORDER BY created_at DESC').all(storeId);
    }

    static create({ storeId, name, templateName, languageCode = 'es', parametersMapping = [] }) {
        const db = getDb();
        const mappingJson = JSON.stringify(parametersMapping);

        const result = db.prepare(`
            INSERT INTO campaigns (store_id, name, template_name, language_code, parameters_mapping, status)
            VALUES (?, ?, ?, ?, ?, 'draft')
        `).run(storeId, name, templateName, languageCode, mappingJson);

        const campaignId = result.lastInsertRowid;

        // Añadir destinatarios del CRM de la tienda
        const customers = db.prepare('SELECT phone, name FROM customers WHERE store_id = ?').all(storeId);
        const insertRecipient = db.prepare(`
            INSERT INTO campaign_recipients (campaign_id, customer_phone, customer_name, status)
            VALUES (?, ?, ?, 'pending')
        `);

        for (const cust of customers) {
            insertRecipient.run(campaignId, cust.phone, cust.name || '');
        }

        // Actualizar total de destinatarios
        db.prepare('UPDATE campaigns SET total_recipients = ? WHERE id = ?').run(customers.length, campaignId);

        return this.getById(campaignId);
    }

    static getRecipients(campaignId) {
        return getDb().prepare('SELECT * FROM campaign_recipients WHERE campaign_id = ?').all(campaignId);
    }

    static updateProgress(campaignId, sentCount, failedCount, status) {
        const db = getDb();
        db.prepare(`
            UPDATE campaigns 
            SET sent_count = sent_count + ?, 
                failed_count = failed_count + ?,
                status = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(sentCount, failedCount, status, campaignId);
    }
}

module.exports = Campaign;

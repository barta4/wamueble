const BaileysProvider = require('./whatsapp/BaileysProvider');
const MetaCloudProvider = require('./whatsapp/MetaCloudProvider');

class WhatsAppManager {
    constructor() {
        this.providers = new Map(); // connectionId (Number) -> Provider
        this.io = null;
        this.provider = null; // fallback for legacy code
    }

    _getDb() {
        return require('../config/db').getDb();
    }

    async initialize(io) {
        this.io = io;
        try {
            const connections = this._getDb().prepare("SELECT * FROM whatsapp_connections WHERE active = 1").all();
            console.log(`🔌 Cargando ${connections.length} conexiones de WhatsApp...`);
            for (const conn of connections) {
                await this.startConnection(conn);
            }
            // Fallback para código heredado
            if (this.providers.size > 0) {
                this.provider = this.providers.values().next().value;
            }
        } catch (error) {
            console.error("❌ Error inicializando WhatsAppManager:", error.message);
        }
    }

    async startConnection(conn, force = false) {
        const connectionId = Number(conn.id);
        
        // Detener si ya existe
        if (this.providers.has(connectionId)) {
            await this.stopConnection(connectionId);
        }

        let provider;
        if (conn.mode === 'meta') {
            provider = new MetaCloudProvider(connectionId, conn.store_id);
        } else {
            provider = new BaileysProvider(connectionId, conn.store_id);
        }

        try {
            await provider.initialize(this.io, force);
            this.providers.set(connectionId, provider);
            
            // Si es meta o baileys está conectado ya
            const isConnected = conn.mode === 'meta' ? !!conn.meta_access_token : (provider.sock && provider.sock.user);
            this._getDb().prepare("UPDATE whatsapp_connections SET status = ? WHERE id = ?").run(isConnected ? 'connected' : 'disconnected', connectionId);
            
            // Actualizar el fallback
            if (!this.provider) this.provider = provider;
            
            console.log(`✅ Conexión de WhatsApp ${connectionId} inicializada en modo: ${conn.mode}`);
        } catch (error) {
            console.error(`❌ Error inicializando conexión ${connectionId}:`, error.message);
        }
    }

    async stopConnection(connectionId) {
        const id = Number(connectionId);
        const provider = this.providers.get(id);
        if (provider) {
            if (provider instanceof BaileysProvider && provider.sock) {
                try {
                    provider.sock.logout();
                } catch(e){}
            }
            this.providers.delete(id);
            this._getDb().prepare("UPDATE whatsapp_connections SET status = 'disconnected' WHERE id = ?").run(id);
            
            // Si el fallback era este, poner otro o null
            if (this.provider === provider) {
                this.provider = this.providers.size > 0 ? this.providers.values().next().value : null;
            }
        }
    }

    getProvider(connectionId) {
        return this.providers.get(Number(connectionId));
    }

    getProviderByPhoneId(phoneId) {
        for (const p of this.providers.values()) {
            if (p instanceof MetaCloudProvider && p.phoneNumberId === phoneId) {
                return p;
            }
        }
        return null;
    }

    getPrimaryProviderForStore(storeId) {
        const storeConns = Array.from(this.providers.values()).filter(p => p.storeId === Number(storeId));
        if (storeConns.length === 0) return null;
        
        // Retornar el que esté conectado, si hay
        const connected = storeConns.find(p => p instanceof BaileysProvider ? (p.sock && p.sock.user) : !!p.accessToken);
        return connected || storeConns[0];
    }

    // --- Acciones de envío con ruteo multitenant ---

    async sendTextMessage(phone, text, storeId) {
        const provider = storeId ? this.getPrimaryProviderForStore(storeId) : this.provider;
        if (!provider) throw new Error("WhatsApp no está conectado.");
        return provider.sendTextMessage(phone, text);
    }

    async sendOrderConfirmation(phone, orderData, storeId) {
        const provider = storeId ? this.getPrimaryProviderForStore(storeId) : this.provider;
        if (!provider) throw new Error("WhatsApp no está conectado.");
        return provider.sendOrderConfirmation(phone, orderData);
    }

    async notifyDelivery(order, driverPhone, storeId) {
        const provider = storeId ? this.getPrimaryProviderForStore(storeId) : this.provider;
        if (!provider) throw new Error("WhatsApp no está conectado.");
        return provider.notifyDelivery(order, driverPhone);
    }

    async notifyCustomerReady(phone, orderNumber, storeId) {
        const provider = storeId ? this.getPrimaryProviderForStore(storeId) : this.provider;
        if (!provider) throw new Error("WhatsApp no está conectado.");
        return provider.notifyCustomerReady(phone, orderNumber);
    }

    async downloadMedia(messageId, metadata, connectionId) {
        const provider = connectionId ? this.getProvider(connectionId) : this.provider;
        if (!provider) throw new Error("WhatsApp no está conectado.");
        return provider.downloadMedia(messageId, metadata);
    }

    async sendImageMessage(phone, imageBuffer, caption = '', storeId) {
        const provider = storeId ? this.getPrimaryProviderForStore(storeId) : this.provider;
        if (!provider) throw new Error("WhatsApp no está conectado.");
        return provider.sendImageMessage(phone, imageBuffer, caption);
    }

    async sendDocumentMessage(phone, docBuffer, filename, caption = '', storeId) {
        const provider = storeId ? this.getPrimaryProviderForStore(storeId) : this.provider;
        if (!provider) throw new Error("WhatsApp no está conectado.");
        return provider.sendDocumentMessage(phone, docBuffer, filename, caption);
    }

    async getBaileysPairingCode(phone, connectionId) {
        const provider = this.getProvider(connectionId);
        if (!provider || !(provider instanceof BaileysProvider)) {
            throw new Error("Conexión Baileys no encontrada o no cargada.");
        }
        return provider.requestPairingCode(phone);
    }
}

const manager = new WhatsAppManager();
module.exports = manager;

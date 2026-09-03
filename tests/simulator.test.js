jest.mock('../src/utils/aiModelFactory', () => ({
    createModel: jest.fn().mockReturnValue({
        bindTools: jest.fn().mockReturnThis(),
        invoke: jest.fn().mockResolvedValue({
            content: '¡Hola! ¿En qué te puedo ayudar hoy? 😊',
            tool_calls: []
        })
    })
}));

const ejs = require('ejs');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../src/config/db');

describe('Simulador Chat - Tests de Mejoras Multimodales y UI', () => {
    beforeAll(() => {
        getDb();
    });

    test('Compilación y renderizado de la plantilla simulator.ejs', () => {
        const templatePath = path.join(__dirname, '..', 'src', 'views', 'simulator.ejs');
        const templateContent = fs.readFileSync(templatePath, 'utf8');

        // Renderizar plantilla con datos de prueba
        const html = ejs.render(templateContent, {
            title: 'Simulador Chat — Test Store',
            store: {
                name: 'Pizzería Test',
                bot_name: 'PepeBot',
                theme_emoji: '🍕',
                welcome_message: '¡Hola! ¿Qué pizza te gustaría ordenar?'
            },
            user: { id: 1, role: 'owner', store_id: 1 }
        });

        expect(html).toContain('PepeBot');
        expect(html).toContain('Pizzería Test');
        expect(html).toContain('id="imageFileInput"');
        expect(html).toContain('id="recordingBar"');
        expect(html).toContain('id="dropOverlay"');
        expect(html).toContain('id="imagePreviewBar"');
        expect(html).toContain('resetChat()');
        expect(html).toContain('toggleDebug()');
    });

    test('Limpieza de conversación en BD (Simulación de Reset)', () => {
        const db = getDb();
        const testPhone = '+59899887766';
        const storeId = 1;

        // Insertar conversación de prueba
        db.prepare(`
            INSERT OR REPLACE INTO conversations (store_id, customer_phone, messages, status)
            VALUES (?, ?, ?, 'active')
        `).run(storeId, testPhone, JSON.stringify([{ role: 'human', content: 'test' }]));

        const before = db.prepare("SELECT * FROM conversations WHERE store_id = ? AND customer_phone = ?").get(storeId, testPhone);
        expect(before).toBeDefined();

        // Ejecutar borrado como en /api/simulate/reset
        db.prepare("DELETE FROM conversations WHERE store_id = ? AND customer_phone = ?").run(storeId, testPhone);

        const after = db.prepare("SELECT * FROM conversations WHERE store_id = ? AND customer_phone = ?").get(storeId, testPhone);
        expect(after).toBeUndefined();
    });

    test('LangChain processMessage estructura con campo images', async () => {
        const { getLangChainService } = require('../src/services/langchain');
        const service = getLangChainService();
        expect(service).toBeDefined();
        expect(typeof service.processMessage).toBe('function');

        const result = await service.processMessage('Hola', 1, '+59899887766');
        expect(result).toHaveProperty('response');
        expect(result).toHaveProperty('images');
        expect(Array.isArray(result.images)).toBe(true);
    });
});

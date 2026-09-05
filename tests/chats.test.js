jest.mock('../src/services/whatsapp', () => ({
    sendTextMessage: jest.fn().mockResolvedValue({ success: true }),
    sendMediaMessage: jest.fn().mockResolvedValue({ success: true }),
    sendMessage: jest.fn().mockResolvedValue({ success: true })
}));

let mockUser = { id: 1, name: 'Operador Test', role: 'owner', store_id: 1 };

jest.mock('../src/middleware/auth', () => ({
    requireAuth: (req, res, next) => {
        req.user = mockUser;
        next();
    }
}));

const express = require('express');
const { getDb } = require('../src/config/db');
const User = require('../src/models/User');
const Store = require('../src/models/Store');
const chatsRouter = require('../src/routes/chats');

describe('Suite de Pruebas: Chat Pro - Archivar, Favoritos y Asignación de Agentes', () => {
    let app;
    let server;
    let baseUrl;
    let storeId;
    let testUser;
    const testPhone = '+59899123456';
    const testPhone2 = '+59899654321';

    beforeAll(async () => {
        getDb();

        // Crear Store de prueba
        const store = Store.create({
            name: 'Chat Test Store',
            phone: '59899990000',
            address: 'Av. Chats 123',
            businessType: 'general'
        });
        storeId = store.id;

        // Crear Usuario Operador
        try {
            testUser = await User.create({
                name: 'Operador Test',
                email: `operador_${Date.now()}@test.com`,
                password: 'password123',
                role: 'owner',
                storeId: storeId
            });
        } catch (e) {
            testUser = User.findByEmail('admin@wabot.com') || { id: 1, name: 'Admin', store_id: storeId };
        }

        mockUser = {
            id: testUser.id,
            name: testUser.name,
            role: testUser.role,
            store_id: storeId
        };

        // Configurar Express App de prueba
        app = express();
        app.use(express.json());
        app.use('/api/chats', chatsRouter);

        await new Promise((resolve) => {
            server = app.listen(0, () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}/api/chats`;
                resolve();
            });
        });
    });

    afterAll(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    beforeEach(() => {
        const db = getDb();
        db.prepare('DELETE FROM conversations WHERE store_id = ?').run(storeId);
    });

    test('1. GET /api/chats/operators retorna la lista de agentes de la tienda', async () => {
        const res = await fetch(`${baseUrl}/operators`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.some(op => op.id === testUser.id)).toBe(true);
    });

    test('2. GET /api/chats/counts retorna contadores en 0 cuando no hay chats', async () => {
        const res = await fetch(`${baseUrl}/counts`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toEqual({
            all: 0,
            favorites: 0,
            archived: 0,
            mine: 0,
            unassigned: 0
        });
    });

    test('3. Inserción de chats y validación de contadores (/api/chats/counts)', async () => {
        const db = getDb();
        
        // Chat 1: Activo, Favorito, Asignado a testUser
        db.prepare(`
            INSERT INTO conversations (store_id, customer_phone, messages, is_favorite, is_archived, assigned_to, assigned_name)
            VALUES (?, ?, '[]', 1, 0, ?, ?)
        `).run(storeId, testPhone, testUser.id, testUser.name);

        // Chat 2: Archivado, Sin Asignar
        db.prepare(`
            INSERT INTO conversations (store_id, customer_phone, messages, is_favorite, is_archived, assigned_to, assigned_name)
            VALUES (?, ?, '[]', 0, 1, NULL, NULL)
        `).run(storeId, testPhone2);

        const res = await fetch(`${baseUrl}/counts`);
        expect(res.status).toBe(200);
        const counts = await res.json();

        expect(counts.all).toBe(1); // Solo los no archivados
        expect(counts.favorites).toBe(1);
        expect(counts.archived).toBe(1);
        expect(counts.mine).toBe(1);
        expect(counts.unassigned).toBe(0); // Chat 2 está archivado
    });

    test('4. PATCH /api/chats/:phone/assign asigna y desasigna un operador', async () => {
        const db = getDb();
        db.prepare(`
            INSERT INTO conversations (store_id, customer_phone, messages, is_archived)
            VALUES (?, ?, '[]', 0)
        `).run(storeId, testPhone);

        // Asignar a testUser
        const resAssign = await fetch(`${baseUrl}/${encodeURIComponent(testPhone)}/assign`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: testUser.id })
        });
        expect(resAssign.status).toBe(200);
        const assignData = await resAssign.json();
        expect(assignData.success).toBe(true);
        expect(assignData.assigned_to).toBe(testUser.id);
        expect(assignData.assigned_name).toBe(testUser.name);

        // Verificar en BD
        const row = db.prepare('SELECT assigned_to, assigned_name FROM conversations WHERE store_id = ? AND customer_phone = ?').get(storeId, testPhone);
        expect(row.assigned_to).toBe(testUser.id);
        expect(row.assigned_name).toBe(testUser.name);

        // Desasignar operador
        const resUnassign = await fetch(`${baseUrl}/${encodeURIComponent(testPhone)}/assign`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: null })
        });
        expect(resUnassign.status).toBe(200);
        const unassignData = await resUnassign.json();
        expect(unassignData.success).toBe(true);
        expect(unassignData.assigned_to).toBeNull();
        expect(unassignData.assigned_name).toBeNull();
    });

    test('5. PATCH /api/chats/:phone/favorite y /archive conmutan estados', async () => {
        const db = getDb();
        db.prepare(`
            INSERT INTO conversations (store_id, customer_phone, messages, is_favorite, is_archived)
            VALUES (?, ?, '[]', 0, 0)
        `).run(storeId, testPhone);

        // Toggle Favorito -> Activar
        const resFav1 = await fetch(`${baseUrl}/${encodeURIComponent(testPhone)}/favorite`, { method: 'PATCH' });
        expect(resFav1.status).toBe(200);
        const favData1 = await resFav1.json();
        expect(Boolean(favData1.is_favorite)).toBe(true);

        // Toggle Favorito -> Desactivar
        const resFav2 = await fetch(`${baseUrl}/${encodeURIComponent(testPhone)}/favorite`, { method: 'PATCH' });
        expect(resFav2.status).toBe(200);
        const favData2 = await resFav2.json();
        expect(Boolean(favData2.is_favorite)).toBe(false);

        // Toggle Archivar -> Archivar
        const resArch1 = await fetch(`${baseUrl}/${encodeURIComponent(testPhone)}/archive`, { method: 'PATCH' });
        expect(resArch1.status).toBe(200);
        const archData1 = await resArch1.json();
        expect(Boolean(archData1.is_archived)).toBe(true);

        // Toggle Archivar -> Desarchivar
        const resArch2 = await fetch(`${baseUrl}/${encodeURIComponent(testPhone)}/archive`, { method: 'PATCH' });
        expect(resArch2.status).toBe(200);
        const archData2 = await resArch2.json();
        expect(Boolean(archData2.is_archived)).toBe(false);
    });

    test('6. GET /api/chats respeta filtros de favoritos y archivados', async () => {
        const db = getDb();
        db.prepare(`
            INSERT INTO conversations (store_id, customer_phone, messages, is_favorite, is_archived)
            VALUES (?, ?, '[]', 1, 0)
        `).run(storeId, testPhone);

        db.prepare(`
            INSERT INTO conversations (store_id, customer_phone, messages, is_favorite, is_archived)
            VALUES (?, ?, '[]', 0, 1)
        `).run(storeId, testPhone2);

        // Filtro default ('all'): solo no archivados
        const resAll = await fetch(`${baseUrl}?filter=all`);
        const dataAll = await resAll.json();
        expect(dataAll.length).toBe(1);
        expect(dataAll[0].customer_phone).toBe(testPhone);

        // Filtro 'favorites': solo favoritos no archivados
        const resFav = await fetch(`${baseUrl}?filter=favorites`);
        const dataFav = await resFav.json();
        expect(dataFav.length).toBe(1);
        expect(dataFav[0].customer_phone).toBe(testPhone);

        // Filtro 'archived': solo archivados
        const resArch = await fetch(`${baseUrl}?filter=archived`);
        const dataArch = await resArch.json();
        expect(dataArch.length).toBe(1);
        expect(dataArch[0].customer_phone).toBe(testPhone2);
    });

    test('7. GET /api/chats/:phone/messages devuelve metadata completa', async () => {
        const db = getDb();
        db.prepare(`
            INSERT INTO conversations (store_id, customer_phone, messages, is_favorite, is_archived, is_blocked, assigned_to, assigned_name)
            VALUES (?, ?, '[]', 1, 0, 0, ?, ?)
        `).run(storeId, testPhone, testUser.id, testUser.name);

        const res = await fetch(`${baseUrl}/${encodeURIComponent(testPhone)}/messages`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.is_favorite).toBe(1);
        expect(data.is_archived).toBe(0);
        expect(data.assigned_to).toBe(testUser.id);
        expect(data.assigned_name).toBe(testUser.name);
    });
});

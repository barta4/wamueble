const GoogleSheetsService = require('../src/services/GoogleSheetsService');
const Store = require('../src/models/Store');
const Product = require('../src/models/Product');
const { getDb } = require('../src/config/db');

describe('Google Sheets Connector Service', () => {
    let testStore;

    beforeAll(() => {
        // Inicializar BD
        const db = getDb();
        testStore = Store.create({
            name: 'Tienda Test Sheets',
            phone: '59899000111',
            adminPassword: 'password123'
        });
    });

    afterAll(() => {
        if (testStore && testStore.id) {
            Store.delete(testStore.id);
        }
    });

    describe('1. Parser de URLs de Google Sheets', () => {
        test('Debe extraer ID y GID de una URL estándar de edición', () => {
            const url = 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?gid=456#gid=456';
            const parsed = GoogleSheetsService.parseSheetUrl(url);

            expect(parsed.spreadsheetId).toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
            expect(parsed.gid).toBe('456');
            expect(parsed.isPublishedWeb).toBe(false);
        });

        test('Debe extraer ID de una URL de publicación en la web (/pubhtml)', () => {
            const url = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQRgUptlbs74OgvE2upms/pubhtml';
            const parsed = GoogleSheetsService.parseSheetUrl(url);

            expect(parsed.spreadsheetId).toBe('2PACX-1vQRgUptlbs74OgvE2upms');
            expect(parsed.isPublishedWeb).toBe(true);
        });

        test('Debe aceptar un ID de hoja de cálculo directo', () => {
            const rawId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
            const parsed = GoogleSheetsService.parseSheetUrl(rawId);

            expect(parsed.spreadsheetId).toBe(rawId);
            expect(parsed.gid).toBe('0');
        });

        test('Debe lanzar error ante URLs inválidas', () => {
            expect(() => GoogleSheetsService.parseSheetUrl('https://google.com')).toThrow();
            expect(() => GoogleSheetsService.parseSheetUrl('')).toThrow();
            expect(() => GoogleSheetsService.parseSheetUrl(null)).toThrow();
        });
    });

    describe('2. Sanitización y Conversión de Precios', () => {
        test('Debe manejar números directos', () => {
            expect(GoogleSheetsService.cleanPrice(150.5)).toBe(150.5);
            expect(GoogleSheetsService.cleanPrice(0)).toBe(0);
        });

        test('Debe limpiar símbolos de moneda ($ y USD)', () => {
            expect(GoogleSheetsService.cleanPrice('$ 450')).toBe(450);
            expect(GoogleSheetsService.cleanPrice('USD 12.99')).toBe(12.99);
        });

        test('Debe convertir correctamente formato con coma decimal latinoamericana', () => {
            expect(GoogleSheetsService.cleanPrice('150,50')).toBe(150.5);
            expect(GoogleSheetsService.cleanPrice('$ 1.500,50')).toBe(1500.5);
        });

        test('Debe convertir formato con coma de miles y punto decimal', () => {
            expect(GoogleSheetsService.cleanPrice('1,250.75')).toBe(1250.75);
        });

        test('Debe retornar 0 para valores vacíos o no numéricos', () => {
            expect(GoogleSheetsService.cleanPrice('')).toBe(0);
            expect(GoogleSheetsService.cleanPrice(null)).toBe(0);
            expect(GoogleSheetsService.cleanPrice('gratis')).toBe(0);
        });
    });

    describe('3. Detección Automática de Columnas (Auto-Mapping)', () => {
        test('Debe mapear nombres de columnas comunes en español', () => {
            const headers = ['Producto', 'Precio Unitario', 'Detalles', 'Rubro', 'Stock'];
            const mapping = GoogleSheetsService.autoDetectMapping(headers);

            expect(mapping.name).toBe('Producto');
            expect(mapping.price).toBe('Precio Unitario');
            expect(mapping.description).toBe('Detalles');
            expect(mapping.category).toBe('Rubro');
            expect(mapping.available).toBe('Stock');
        });

        test('Debe mapear nombres de columnas en inglés', () => {
            const headers = ['item', 'cost', 'category', 'description', 'available'];
            const mapping = GoogleSheetsService.autoDetectMapping(headers);

            expect(mapping.name).toBe('item');
            expect(mapping.price).toBe('cost');
            expect(mapping.category).toBe('category');
            expect(mapping.description).toBe('description');
            expect(mapping.available).toBe('available');
        });
    });

    describe('4. Sincronización de Productos (Upsert y Replace)', () => {
        test('Debe sincronizar e importar productos simulados en modo upsert', async () => {
            // Mockear fetchSheetData
            const spyFetch = jest.spyOn(GoogleSheetsService, 'fetchSheetData').mockResolvedValue({
                spreadsheetId: 'test_sheet_123',
                gid: '0',
                headers: ['Nombre', 'Precio', 'Categoria', 'Descripcion'],
                rows: [
                    { Nombre: 'Pizza Muzza Especial', Precio: '$ 420', Categoria: 'Pizzas', Descripcion: 'Salsa casera y muzzarella' },
                    { Nombre: 'Empanada Carne Suave', Precio: '90', Categoria: 'Empanadas', Descripcion: 'Carne cortada a cuchillo' }
                ],
                totalRows: 2
            });

            const result = await GoogleSheetsService.syncProducts(testStore.id, {
                sheetUrl: 'https://docs.google.com/spreadsheets/d/test_sheet_123/edit',
                columnMapping: {
                    name: 'Nombre',
                    price: 'Precio',
                    category: 'Categoria',
                    description: 'Descripcion'
                },
                syncMode: 'upsert'
            });

            expect(result.success).toBe(true);
            expect(result.inserted).toBe(2);
            expect(result.updated).toBe(0);

            // Verificar en la BD
            const products = Product.getByStoreId(testStore.id);
            expect(products.length).toBe(2);

            const p1 = products.find(p => p.name === 'Pizza Muzza Especial');
            expect(p1).toBeDefined();
            expect(p1.price).toBe(420);
            expect(p1.category).toBe('Pizzas');

            // Segunda sincronización con cambio de precio (debe actualizar, no duplicar)
            spyFetch.mockResolvedValueOnce({
                spreadsheetId: 'test_sheet_123',
                gid: '0',
                headers: ['Nombre', 'Precio', 'Categoria', 'Descripcion'],
                rows: [
                    { Nombre: 'Pizza Muzza Especial', Precio: '$ 480', Categoria: 'Pizzas', Descripcion: 'Salsa casera y muzzarella' },
                    { Nombre: 'Fainá Clásico', Precio: '80', Categoria: 'Pizzas', Descripcion: 'Harina de garbanzo' }
                ],
                totalRows: 2
            });

            const result2 = await GoogleSheetsService.syncProducts(testStore.id, {
                sheetUrl: 'https://docs.google.com/spreadsheets/d/test_sheet_123/edit',
                columnMapping: {
                    name: 'Nombre',
                    price: 'Precio',
                    category: 'Categoria',
                    description: 'Descripcion'
                },
                syncMode: 'upsert'
            });

            expect(result2.success).toBe(true);
            expect(result2.updated).toBe(1); // Pizza actualizada
            expect(result2.inserted).toBe(1); // Fainá agregado

            const productsAfter = Product.getByStoreId(testStore.id);
            expect(productsAfter.length).toBe(3);

            const p1Updated = productsAfter.find(p => p.name === 'Pizza Muzza Especial');
            expect(p1Updated.price).toBe(480);

            // Verificar que se guardó la configuración en Store
            const updatedStore = Store.getById(testStore.id);
            expect(updatedStore.google_sheet_url).toBe('https://docs.google.com/spreadsheets/d/test_sheet_123/edit');
            expect(updatedStore.google_sheet_last_sync).toBeTruthy();

            spyFetch.mockRestore();
        });

        test('Debe reemplazar el catálogo completo en modo replace', async () => {
            const spyFetch = jest.spyOn(GoogleSheetsService, 'fetchSheetData').mockResolvedValue({
                spreadsheetId: 'test_sheet_replace',
                gid: '0',
                headers: ['Nombre', 'Precio'],
                rows: [
                    { Nombre: 'Producto Único Reemplazado', Precio: '999' }
                ],
                totalRows: 1
            });

            const result = await GoogleSheetsService.syncProducts(testStore.id, {
                sheetUrl: 'https://docs.google.com/spreadsheets/d/test_sheet_replace/edit',
                columnMapping: { name: 'Nombre', price: 'Precio' },
                syncMode: 'replace'
            });

            expect(result.success).toBe(true);
            expect(result.inserted).toBe(1);

            // Todos los anteriores eliminados, solo queda el nuevo
            const products = Product.getByStoreId(testStore.id);
            expect(products.length).toBe(1);
            expect(products[0].name).toBe('Producto Único Reemplazado');
            expect(products[0].price).toBe(999);

            spyFetch.mockRestore();
        });

        test('Debe sincronizar imágenes y SKU, y preservar la imagen existente si la celda está vacía', async () => {
            // 1. Sincronizar producto con imagen de Google Drive y SKU
            const spyFetch = jest.spyOn(GoogleSheetsService, 'fetchSheetData').mockResolvedValue({
                spreadsheetId: 'test_sheet_img',
                gid: '0',
                headers: ['Nombre', 'Precio', 'Foto', 'Codigo'],
                rows: [
                    { 
                        Nombre: 'Hamburguesa Triple', 
                        Precio: '550', 
                        Foto: 'https://drive.google.com/file/d/1A2B3C4D5E6F/view?usp=sharing',
                        Codigo: 'HMB-003'
                    }
                ],
                totalRows: 1
            });

            const result = await GoogleSheetsService.syncProducts(testStore.id, {
                sheetUrl: 'https://docs.google.com/spreadsheets/d/test_sheet_img/edit',
                columnMapping: { 
                    name: 'Nombre', 
                    price: 'Precio',
                    image: 'Foto',
                    sku: 'Codigo'
                },
                syncMode: 'upsert'
            });

            expect(result.success).toBe(true);
            const products = Product.getByStoreId(testStore.id);
            const burger = products.find(p => p.name === 'Hamburguesa Triple');
            expect(burger).toBeDefined();
            expect(burger.sku).toBe('HMB-003');
            // La URL de Google Drive debe estar normalizada a uc?export=view
            expect(burger.image_path).toBe('https://drive.google.com/uc?export=view&id=1A2B3C4D5E6F');

            // 2. Segunda sincronización donde la celda de Foto viene vacía (no debe borrar la imagen)
            spyFetch.mockResolvedValueOnce({
                spreadsheetId: 'test_sheet_img',
                gid: '0',
                headers: ['Nombre', 'Precio', 'Foto', 'Codigo'],
                rows: [
                    { 
                        Nombre: 'Hamburguesa Triple', 
                        Precio: '590', 
                        Foto: '', // Vacío
                        Codigo: 'HMB-003'
                    }
                ],
                totalRows: 1
            });

            const result2 = await GoogleSheetsService.syncProducts(testStore.id, {
                sheetUrl: 'https://docs.google.com/spreadsheets/d/test_sheet_img/edit',
                columnMapping: { 
                    name: 'Nombre', 
                    price: 'Precio',
                    image: 'Foto',
                    sku: 'Codigo'
                },
                syncMode: 'upsert'
            });

            expect(result2.success).toBe(true);
            const burgerAfter = Product.getById(burger.id);
            expect(burgerAfter.price).toBe(590);
            // La imagen debe preservarse intacta
            expect(burgerAfter.image_path).toBe('https://drive.google.com/uc?export=view&id=1A2B3C4D5E6F');

            spyFetch.mockRestore();
        });
    });

    describe('5. Normalizador de URLs de Imágenes y Auto-Mapping de Media/SKU', () => {
        test('Debe convertir enlaces compartidos de Google Drive a enlaces de visualización directa', () => {
            const driveShare = 'https://drive.google.com/file/d/1A2B3C4D5E6F7G8H/view?usp=sharing';
            const normalized = GoogleSheetsService.normalizeImageUrl(driveShare);
            expect(normalized).toBe('https://drive.google.com/uc?export=view&id=1A2B3C4D5E6F7G8H');
        });

        test('Debe mantener URLs normales de imagen intactas', () => {
            const webUrl = 'https://example.com/images/pizza.jpg';
            expect(GoogleSheetsService.normalizeImageUrl(webUrl)).toBe(webUrl);
        });

        test('Debe auto-detectar columnas de imagen y SKU', () => {
            const headers = ['articulo', 'precio', 'imagen', 'sku'];
            const mapping = GoogleSheetsService.autoDetectMapping(headers);
            expect(mapping.name).toBe('articulo');
            expect(mapping.price).toBe('precio');
            expect(mapping.image).toBe('imagen');
            expect(mapping.sku).toBe('sku');
        });
    });

    describe('6. Modelo Product: SKU, Multi-Precios y Catálogo para IA', () => {
        test('Debe guardar y actualizar SKU y prices_json en Product', () => {
            const product = Product.create({
                storeId: testStore.id,
                name: 'Pizza Napolitana',
                price: 450,
                sku: 'PIZ-NAP-01',
                prices_json: [
                    { label: 'Chica (4 porciones)', price: 320 },
                    { label: 'Grande (8 porciones)', price: 450 },
                    { label: 'Familiar (12 porciones)', price: 620 }
                ]
            });

            expect(product.id).toBeDefined();
            expect(product.sku).toBe('PIZ-NAP-01');
            const parsedPrices = JSON.parse(product.prices_json);
            expect(parsedPrices.length).toBe(3);
            expect(parsedPrices[0].label).toBe('Chica (4 porciones)');

            // Verificar catálogo de IA generado
            const catalogText = Product.getCatalogText(testStore.id);
            expect(catalogText).toContain('Pizza Napolitana');
            expect(catalogText).toContain('[Cód: PIZ-NAP-01]');
            expect(catalogText).toContain('Chica (4 porciones): $320');
        });
    });
});

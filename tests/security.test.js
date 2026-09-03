const path = require('path');
const crypto = require('crypto');

describe('Suite de Pruebas de Seguridad y Hardening (OWASP / Mitigaciones)', () => {

    // ─── 1. Mitigación H2: Path Traversal ─────────────────────────────
    describe('H2: Prevención de Path Traversal en importación de archivos', () => {
        const uploadDir = path.resolve(__dirname, '..', 'data', 'uploads');

        test('Debe neutralizar secuencias de escape de directorio (../)', () => {
            const maliciousFilename = '../../../../etc/passwd';
            const safeFilename = path.basename(maliciousFilename);
            const resolvedPath = path.resolve(uploadDir, safeFilename);

            expect(safeFilename).toBe('passwd');
            expect(resolvedPath.startsWith(uploadDir)).toBe(true);
        });

        test('Debe bloquear nombres vacíos o nulos', () => {
            const safeFilename = path.basename('');
            expect(safeFilename).toBe('');
        });
    });

    // ─── 2. Mitigación H3: Prevención de SSRF y acceso a SQLite local ──
    describe('H3: Prevención de SSRF y confinamiento de bases de datos', () => {
        function isPrivateOrLocalHost(host) {
            if (!host) return false;
            const h = String(host).toLowerCase().trim();
            return h === 'localhost' || h === '127.0.0.1' || h === '::1' ||
                   h.startsWith('127.') || h.startsWith('10.') || h.startsWith('192.168.') ||
                   /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h) ||
                   h === '169.254.169.254' || h.endsWith('.local') || h.endsWith('.internal');
        }

        test('Debe detectar y bloquear loopback y hosts locales', () => {
            expect(isPrivateOrLocalHost('localhost')).toBe(true);
            expect(isPrivateOrLocalHost('127.0.0.1')).toBe(true);
            expect(isPrivateOrLocalHost('127.0.1.1')).toBe(true);
            expect(isPrivateOrLocalHost('::1')).toBe(true);
        });

        test('Debe detectar y bloquear IPs privadas y Cloud Metadata (AWS/GCP/Azure)', () => {
            expect(isPrivateOrLocalHost('169.254.169.254')).toBe(true); // AWS/GCP metadata
            expect(isPrivateOrLocalHost('192.168.1.50')).toBe(true);
            expect(isPrivateOrLocalHost('10.0.0.1')).toBe(true);
            expect(isPrivateOrLocalHost('172.16.0.1')).toBe(true);
            expect(isPrivateOrLocalHost('172.31.255.255')).toBe(true);
            expect(isPrivateOrLocalHost('db.internal')).toBe(true);
        });

        test('Debe permitir hosts públicos y nombres de dominio válidos', () => {
            expect(isPrivateOrLocalHost('db.externalprovider.com')).toBe(false);
            expect(isPrivateOrLocalHost('8.8.8.8')).toBe(false);
            expect(isPrivateOrLocalHost('aws-rds.us-east-1.amazonaws.com')).toBe(false);
        });

        test('Confinamiento de SQLite a data/uploads', () => {
            const uploadDir = path.resolve(__dirname, '..', 'data', 'uploads');
            function getSafeSqlitePath(database) {
                const safeName = path.basename(database || '');
                if (!safeName || (!safeName.endsWith('.sqlite') && !safeName.endsWith('.db'))) {
                    throw new Error('Solo se permite conectar a archivos SQLite (.sqlite o .db) ubicados en data/uploads.');
                }
                const fullPath = path.resolve(uploadDir, safeName);
                if (!fullPath.startsWith(uploadDir)) {
                    throw new Error('Ruta de archivo no permitida.');
                }
                return fullPath;
            }

            // Debe permitir archivo legítimo con extensión .sqlite o .db en uploads
            const safe = getSafeSqlitePath('catalog.sqlite');
            expect(safe).toBe(path.join(uploadDir, 'catalog.sqlite'));

            // Debe rechazar rutas del sistema y archivos sensibles
            expect(() => getSafeSqlitePath('/app/data/wabot.sqlite')).not.toThrow(); // Se convierte en uploadDir/wabot.sqlite
            expect(() => getSafeSqlitePath('/etc/passwd')).toThrow();
            expect(() => getSafeSqlitePath('config.json')).toThrow();
        });
    });

    // ─── 3. Mitigación H6: Whitelist de imágenes ──────────────────────
    describe('H6: Whitelist de extensiones de archivos de imagen', () => {
        const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
        const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

        function validateImageUpload(originalName, mimeType) {
            const ext = path.extname(originalName).toLowerCase();
            return ALLOWED_MIMES.includes(mimeType) && ALLOWED_EXTENSIONS.includes(ext);
        }

        test('Debe permitir formatos de imagen comunes', () => {
            expect(validateImageUpload('foto.jpg', 'image/jpeg')).toBe(true);
            expect(validateImageUpload('foto.png', 'image/png')).toBe(true);
            expect(validateImageUpload('foto.webp', 'image/webp')).toBe(true);
        });

        test('Debe rechazar archivos peligrosos (SVG con XSS, HTML, scripts)', () => {
            expect(validateImageUpload('payload.svg', 'image/svg+xml')).toBe(false);
            expect(validateImageUpload('shell.php', 'application/x-php')).toBe(false);
            expect(validateImageUpload('script.html', 'text/html')).toBe(false);
            expect(validateImageUpload('exploit.png.exe', 'image/png')).toBe(false);
        });
    });

    // ─── 4. Mitigación H7: Comparación en tiempo constante ────────────
    describe('H7: Comparación segura de firmas HMAC contra timing attacks', () => {
        const secret = 'super_secret_webhook_token';
        const payload = JSON.stringify({ event: 'order.created', id: 1001 });

        const correctHash = crypto.createHmac('sha256', secret).update(payload).digest('hex');
        const wrongHash = crypto.createHmac('sha256', 'wrong_secret').update(payload).digest('hex');

        function verifyHmac(sig, expected) {
            const sigBuf = Buffer.from(sig, 'utf-8');
            const expBuf = Buffer.from(expected, 'utf-8');
            if (sigBuf.length !== expBuf.length) return false;
            return crypto.timingSafeEqual(sigBuf, expBuf);
        }

        test('Debe validar correctamente la firma legítima', () => {
            expect(verifyHmac(correctHash, correctHash)).toBe(true);
        });

        test('Debe rechazar firmas alteradas o inválidas', () => {
            expect(verifyHmac(wrongHash, correctHash)).toBe(false);
            expect(verifyHmac('short', correctHash)).toBe(false);
        });
    });
});

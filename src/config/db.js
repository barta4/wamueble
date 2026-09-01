const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db = null;

/**
 * Inicializa y retorna la conexión a la base de datos SQLite.
 * Crea el directorio y ejecuta el schema si la BD no existe.
 */
function getDb() {
    if (db) return db;

    const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'wabot.db');
    const dbDir = path.dirname(dbPath);

    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    const isNew = !fs.existsSync(dbPath);

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');

    if (isNew) {
        initSchema();
        runSeed();
    }

    runMigrations();
    return db;
}

function safeSqlRun(query) {
    try {
        db.prepare(query).run();
    } catch (e) {
        // Ignorar solo si es error de columna o tabla duplicada ya existente
        if (!e.message.includes('duplicate column name') && !e.message.includes('already exists')) {
            console.warn('⚠️ Nota sobre migración DB:', e.message);
        }
    }
}

/**
 * Ejecuta migraciones incrementales sobre la base de datos.
 */
function runMigrations() {
    // Tabla de usuarios
    safeSqlRun(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT DEFAULT 'owner',
            store_id INTEGER,
            plan TEXT DEFAULT 'free',
            plan_expires_at DATETIME,
            email_verified INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL
        )
    `);
    safeSqlRun(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    safeSqlRun(`CREATE INDEX IF NOT EXISTS idx_users_store ON users(store_id)`);

    // Tabla de sesiones
    safeSqlRun(`
        CREATE TABLE IF NOT EXISTS sessions (
            sid TEXT PRIMARY KEY,
            sess TEXT NOT NULL,
            expire DATETIME NOT NULL
        )
    `);
    safeSqlRun(`CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire)`);

    // Migraciones de citas
    safeSqlRun("ALTER TABLE appointments ADD COLUMN duration INTEGER DEFAULT 30");
    safeSqlRun("ALTER TABLE appointments ADD COLUMN total REAL DEFAULT 0");
    safeSqlRun("ALTER TABLE appointments ADD COLUMN notes TEXT");
    safeSqlRun("ALTER TABLE appointments ADD COLUMN status TEXT DEFAULT 'pending'");

    // Tabla de Doctores
    safeSqlRun(`
        CREATE TABLE IF NOT EXISTS doctors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            store_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            specialty TEXT,
            active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
        )
    `);
    safeSqlRun(`CREATE INDEX IF NOT EXISTS idx_doctors_store ON doctors(store_id, active)`);

    // Migraciones de stores
    safeSqlRun("ALTER TABLE stores ADD COLUMN bot_name TEXT DEFAULT 'Bot'");
    safeSqlRun("ALTER TABLE stores ADD COLUMN business_type TEXT DEFAULT 'general'");
    safeSqlRun("ALTER TABLE stores ADD COLUMN ai_prompt TEXT DEFAULT ''");
    safeSqlRun('ALTER TABLE stores ADD COLUMN categories TEXT DEFAULT \'["General"]\'');
    safeSqlRun("ALTER TABLE stores ADD COLUMN theme_emoji TEXT DEFAULT '🏪'");
    safeSqlRun("ALTER TABLE stores ADD COLUMN welcome_message TEXT DEFAULT ''");
    safeSqlRun("ALTER TABLE stores ADD COLUMN currency TEXT DEFAULT 'USD'");
    safeSqlRun("ALTER TABLE stores ADD COLUMN owner_user_id INTEGER");
    safeSqlRun("ALTER TABLE stores ADD COLUMN plan TEXT DEFAULT 'free'");
    safeSqlRun("ALTER TABLE stores ADD COLUMN plan_expires_at DATETIME");

    // Migraciones de orders
    safeSqlRun("ALTER TABLE orders ADD COLUMN media_urls TEXT");

    // Tabla de configuración
    try {
        db.prepare(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `).run();
    } catch (e) {}
    try {
        db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('bot_active', '1')`).run();
    } catch (e) {}

    // Tabla de clientes
    try {
        db.prepare(`
            CREATE TABLE IF NOT EXISTS customers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                store_id INTEGER NOT NULL,
                phone TEXT NOT NULL,
                name TEXT,
                total_orders INTEGER DEFAULT 0,
                total_spent REAL DEFAULT 0,
                bot_notes TEXT DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
                UNIQUE(store_id, phone)
            )
        `).run();
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(store_id, phone)`).run();
        try { db.prepare("ALTER TABLE customers ADD COLUMN ai_provider TEXT DEFAULT NULL").run(); } catch(e) {}
    } catch (e) {}

    // Tabla de conexiones a BD externas
    try {
        db.prepare(`
            CREATE TABLE IF NOT EXISTS db_connections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                store_id INTEGER NOT NULL,
                db_type TEXT NOT NULL,
                host TEXT,
                port INTEGER,
                database_name TEXT,
                username TEXT,
                password_encrypted TEXT,
                table_name TEXT,
                column_mapping TEXT,
                last_sync DATETIME,
                active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
            )
        `).run();
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_db_connections_store ON db_connections(store_id, active)`).run();
    } catch (e) {}

    // Columnas de conversaciones
    try { db.prepare("ALTER TABLE conversations ADD COLUMN is_favorite INTEGER DEFAULT 0").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE conversations ADD COLUMN is_archived INTEGER DEFAULT 0").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE conversations ADD COLUMN is_blocked INTEGER DEFAULT 0").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE conversations ADD COLUMN is_deleted INTEGER DEFAULT 0").run(); } catch(e) {}

    // Columnas opcionales para migración transparente
    try { db.prepare("ALTER TABLE stores ADD COLUMN clinic_mode INTEGER DEFAULT 0").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE stores ADD COLUMN hostel_mode INTEGER DEFAULT 0").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT 'pending'").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE products ADD COLUMN image_path TEXT").run(); } catch(e) {}
    try { db.prepare("CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id, available)").run(); } catch(e) {}
    try { db.prepare("CREATE INDEX IF NOT EXISTS idx_orders_store_status ON orders(store_id, status)").run(); } catch(e) {}
    try { db.prepare("CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC)").run(); } catch(e) {}
    try { db.prepare("CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(customer_phone, store_id, status)").run(); } catch(e) {}
    try { db.prepare("CREATE INDEX IF NOT EXISTS idx_drivers_store ON delivery_drivers(store_id, active)").run(); } catch(e) {}

    // ─── Migraciones SaaS Admin ──────────────────────────────────────────
    // IA por tenant
    try { db.prepare("ALTER TABLE stores ADD COLUMN ai_provider TEXT DEFAULT 'openai'").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE stores ADD COLUMN ai_model TEXT DEFAULT 'gpt-4o'").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE stores ADD COLUMN ai_api_key TEXT DEFAULT ''").run(); } catch(e) {}

    // WhatsApp por tenant
    try { db.prepare("ALTER TABLE stores ADD COLUMN whatsapp_provider TEXT DEFAULT 'baileys'").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE stores ADD COLUMN whatsapp_status TEXT DEFAULT 'disconnected'").run(); } catch(e) {}

    // Métricas de uso
    try { db.prepare("ALTER TABLE stores ADD COLUMN orders_this_month INTEGER DEFAULT 0").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE stores ADD COLUMN last_active_at DATETIME").run(); } catch(e) {}

    // Estado general
    try { db.prepare("ALTER TABLE stores ADD COLUMN suspended INTEGER DEFAULT 0").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE stores ADD COLUMN suspended_reason TEXT DEFAULT ''").run(); } catch(e) {}

    // Tabla de auditoría SaaS
    try {
        db.prepare(`
            CREATE TABLE IF NOT EXISTS saas_audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                admin_user_id INTEGER NOT NULL,
                action TEXT NOT NULL,
                target_type TEXT,
                target_id INTEGER,
                details TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (admin_user_id) REFERENCES users(id)
            )
        `).run();
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_admin ON saas_audit_log(admin_user_id, created_at DESC)`).run();
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_target ON saas_audit_log(target_type, target_id)`).run();
    } catch(e) {}

    // Tabla de planes SaaS (editables)
    try {
        db.prepare(`
            CREATE TABLE IF NOT EXISTS saas_plans (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                price REAL DEFAULT 0,
                currency TEXT DEFAULT 'USD',
                interval TEXT DEFAULT 'month',
                description TEXT DEFAULT '',
                features TEXT DEFAULT '[]',
                limits TEXT DEFAULT '{}',
                active INTEGER DEFAULT 1,
                sort_order INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `).run();
    } catch(e) {}

    // ─── Migraciones Modo Clínica ──────────────────────────────────────────
    try { db.prepare("ALTER TABLE stores ADD COLUMN clinic_mode INTEGER DEFAULT 0").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE stores ADD COLUMN working_hours TEXT DEFAULT '08:00-20:00'").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE stores ADD COLUMN slot_duration INTEGER DEFAULT 30").run(); } catch(e) {}

    // ─── Migraciones Modo Hostel ───────────────────────────────────────────
    try { db.prepare("ALTER TABLE stores ADD COLUMN hostel_mode INTEGER DEFAULT 0").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE stores ADD COLUMN room_types TEXT DEFAULT '[]'").run(); } catch(e) {}

    // ─── Migraciones Notificaciones Externas ───────────────────────────────
    try { db.prepare("ALTER TABLE stores ADD COLUMN notify_phone TEXT DEFAULT ''").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE stores ADD COLUMN notify_email TEXT DEFAULT ''").run(); } catch(e) {}
    try { db.prepare("ALTER TABLE stores ADD COLUMN notification_events TEXT DEFAULT '[\"new\",\"ready\"]'").run(); } catch(e) {}

    // Tabla de citas
    try {
        db.prepare(`
            CREATE TABLE IF NOT EXISTS appointments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                store_id INTEGER NOT NULL,
                appointment_number TEXT NOT NULL,
                customer_phone TEXT NOT NULL,
                customer_name TEXT,
                service TEXT NOT NULL,
                doctor TEXT,
                date TEXT NOT NULL,
                time TEXT NOT NULL,
                duration INTEGER DEFAULT 30,
                total REAL DEFAULT 0,
                status TEXT DEFAULT 'pending',
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
            )
        `).run();
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_appointments_store_date ON appointments(store_id, date)`).run();
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_appointments_store_status ON appointments(store_id, status)`).run();
    } catch(e) {}

    // Tablas de Hostel (rooms y bookings)
    try {
        db.prepare(`
            CREATE TABLE IF NOT EXISTS rooms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                store_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                room_type TEXT DEFAULT 'shared_dorm',
                capacity INTEGER DEFAULT 1,
                price_per_night REAL NOT NULL,
                total_units INTEGER DEFAULT 1,
                active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
            )
        `).run();
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_rooms_store ON rooms(store_id, active)`).run();

        db.prepare(`
            CREATE TABLE IF NOT EXISTS bookings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                store_id INTEGER NOT NULL,
                booking_number TEXT NOT NULL,
                customer_phone TEXT NOT NULL,
                customer_name TEXT,
                room_id INTEGER,
                room_name TEXT NOT NULL,
                check_in_date TEXT NOT NULL,
                check_out_date TEXT NOT NULL,
                guests_count INTEGER DEFAULT 1,
                total_price REAL DEFAULT 0,
                payment_status TEXT DEFAULT 'pending',
                status TEXT DEFAULT 'pending',
                payment_method TEXT,
                notes TEXT,
                passport_info TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
                FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
            )
        `).run();
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_bookings_store_dates ON bookings(store_id, check_in_date, check_out_date)`).run();
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_bookings_store_status ON bookings(store_id, status)`).run();
    } catch(e) {}

    // Tabla de conexiones de WhatsApp (Multitenant / Múltiples cuentas por tienda)
    try {
        db.prepare(`
            CREATE TABLE IF NOT EXISTS whatsapp_connections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                store_id INTEGER NOT NULL,
                phone TEXT,
                mode TEXT DEFAULT 'baileys',
                meta_access_token TEXT,
                meta_phone_id TEXT,
                meta_verify_token TEXT,
                status TEXT DEFAULT 'disconnected',
                active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
            )
        `).run();
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_store ON whatsapp_connections(store_id)`).run();

        // Tabla de seguimiento y automatizaciones post-atención
        db.prepare(`
            CREATE TABLE IF NOT EXISTS follow_up_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                store_id INTEGER NOT NULL,
                customer_phone TEXT NOT NULL,
                event_type TEXT NOT NULL,
                reference_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
                UNIQUE(store_id, event_type, reference_id)
            )
        `).run();
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_follow_up_store ON follow_up_logs(store_id, event_type)`).run();

        // Tablas de Campañas de Difusión Oficiales Meta
        db.prepare(`
            CREATE TABLE IF NOT EXISTS campaigns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                store_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                template_name TEXT NOT NULL,
                language_code TEXT DEFAULT 'es',
                parameters_mapping TEXT,
                status TEXT DEFAULT 'draft',
                total_recipients INTEGER DEFAULT 0,
                sent_count INTEGER DEFAULT 0,
                failed_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
            )
        `).run();

        db.prepare(`
            CREATE TABLE IF NOT EXISTS campaign_recipients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                campaign_id INTEGER NOT NULL,
                customer_phone TEXT NOT NULL,
                customer_name TEXT,
                status TEXT DEFAULT 'pending',
                sent_at DATETIME,
                error_message TEXT,
                FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
            )
        `).run();

        const connCount = db.prepare("SELECT COUNT(*) as count FROM whatsapp_connections").get().count;
        if (connCount === 0) {
            const mode = db.prepare("SELECT value FROM settings WHERE key = 'whatsapp_mode'").get()?.value || 'baileys';
            const metaToken = db.prepare("SELECT value FROM settings WHERE key = 'meta_access_token'").get()?.value || '';
            const metaPhoneId = db.prepare("SELECT value FROM settings WHERE key = 'meta_phone_id'").get()?.value || '';
            const metaVerifyToken = db.prepare("SELECT value FROM settings WHERE key = 'meta_verify_token'").get()?.value || '';
            
            const firstStore = db.prepare("SELECT id, phone FROM stores LIMIT 1").get();
            if (firstStore) {
                db.prepare(`
                    INSERT INTO whatsapp_connections (store_id, phone, mode, meta_access_token, meta_phone_id, meta_verify_token, status)
                    VALUES (?, ?, ?, ?, ?, ?, 'disconnected')
                `).run(firstStore.id, firstStore.phone || '+59899111111', mode, metaToken, metaPhoneId, metaVerifyToken);
            }
        }
    } catch(e) {
        console.error("Migration error:", e.message);
    }
}

/**
 * Ejecuta el schema SQL para crear las tablas.
 */
function initSchema() {
    const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
    console.log('✅ Schema de base de datos inicializado');
}

/**
 * Ejecuta el archivo seed para cargar datos de ejemplo.
 */
function runSeed() {
    const seedPath = path.join(__dirname, '..', 'db', 'seed.sql');
    const seed = fs.readFileSync(seedPath, 'utf-8');
    db.exec(seed);
    console.log('🌱 Datos de ejemplo cargados');
}

/**
 * Cierra la conexión a la base de datos.
 */
function closeDb() {
    if (db) {
        db.close();
        db = null;
        console.log('🔒 Base de datos cerrada');
    }
}

module.exports = { getDb, initSchema, runSeed, closeDb };

-- =============================================
-- WaBot SaaS — Schema de Base de Datos
-- =============================================

-- Tabla de Usuarios (SaaS auth)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'owner',              -- owner, admin, superadmin
    store_id INTEGER,                       -- FK a stores (null para superadmin)
    plan TEXT DEFAULT 'free',               -- free, pro, enterprise
    plan_expires_at DATETIME,
    email_verified INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL
);

-- Tabla de Sesiones (persistidas en SQLite)
CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expire DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);

-- Tabla de Locales/Tiendas
CREATE TABLE IF NOT EXISTS stores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    admin_password TEXT,
    bot_name TEXT DEFAULT 'Bot',
    business_type TEXT DEFAULT 'general',
    ai_prompt TEXT DEFAULT '',
    categories TEXT DEFAULT '["General"]',
    theme_emoji TEXT DEFAULT '🏪',
    welcome_message TEXT DEFAULT '',
    currency TEXT DEFAULT 'USD',
    owner_user_id INTEGER,
    plan TEXT DEFAULT 'free',
    plan_expires_at DATETIME,
    clinic_mode INTEGER DEFAULT 0,           -- 0=tienda, 1=clínica/citas
    hostel_mode INTEGER DEFAULT 0,           -- 0=tienda, 1=hostel/alojamiento
    working_hours TEXT DEFAULT '08:00-20:00', -- Horario de trabajo
    slot_duration INTEGER DEFAULT 30,         -- Duración de cada cita en minutos
    notify_phone TEXT DEFAULT '',            -- Número secundario para aviso (WhatsApp)
    notify_email TEXT DEFAULT '',            -- Email para aviso
    notification_events TEXT DEFAULT '["new","ready"]', -- Eventos: new=toma pedido, ready=pedido listo
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Tabla de Repartidores
CREATE TABLE IF NOT EXISTS delivery_drivers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

-- Tabla de Productos (Catálogo)
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    category TEXT DEFAULT 'General',
    duration INTEGER DEFAULT 30,
    available INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

-- Tabla de Clientes (CRM)
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
);

-- Tabla de Pedidos
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL,
    order_number TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_name TEXT,
    address TEXT NOT NULL,
    payment_method TEXT,
    status TEXT DEFAULT 'pending',
    total REAL DEFAULT 0,
    notes TEXT,
    media_urls TEXT,
    driver_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ready_at DATETIME,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
    FOREIGN KEY (driver_id) REFERENCES delivery_drivers(id)
);

-- Tabla de Items del Pedido
CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_price REAL NOT NULL,
    details TEXT,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- Tabla de Conversaciones (memoria del agente IA)
CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL,
    customer_phone TEXT NOT NULL,
    messages TEXT DEFAULT '[]',
    status TEXT DEFAULT 'active',
    needs_human INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

-- Tabla de Conexiones a BD Externas
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
);

-- Tabla de Doctores (clínica)
CREATE TABLE IF NOT EXISTS doctors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    specialty TEXT,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

-- Tabla de Citas (modo clínica)
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
    status TEXT DEFAULT 'pending',           -- pending, confirmed, completed, cancelled
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

-- Tabla de Habitaciones/Camas (modo hostel)
CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    room_type TEXT DEFAULT 'shared_dorm',     -- shared_dorm, private, suite
    capacity INTEGER DEFAULT 1,
    price_per_night REAL NOT NULL,
    total_units INTEGER DEFAULT 1,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

-- Tabla de Reservas de Hostel (modo hostel)
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
    payment_status TEXT DEFAULT 'pending',   -- pending, paid, partial
    status TEXT DEFAULT 'pending',           -- pending, confirmed, checked_in, checked_out, cancelled
    payment_method TEXT,
    notes TEXT,
    passport_info TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
);

-- Tabla de Configuración General
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Seguimiento y Automatización Post-Atención
CREATE TABLE IF NOT EXISTS follow_up_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL,
    customer_phone TEXT NOT NULL,
    event_type TEXT NOT NULL,
    reference_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
    UNIQUE(store_id, event_type, reference_id)
);

-- Tabla de Campañas de Difusión Oficiales Meta
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
);

CREATE TABLE IF NOT EXISTS campaign_recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_name TEXT,
    status TEXT DEFAULT 'pending',
    sent_at DATETIME,
    error_message TEXT,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_store ON users(store_id);
CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id, available);
CREATE INDEX IF NOT EXISTS idx_orders_store_status ON orders(store_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(customer_phone, store_id, status);
CREATE INDEX IF NOT EXISTS idx_drivers_store ON delivery_drivers(store_id, active);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(store_id, phone);
CREATE INDEX IF NOT EXISTS idx_db_connections_store ON db_connections(store_id, active);
CREATE INDEX IF NOT EXISTS idx_appointments_store_date ON appointments(store_id, date);
CREATE INDEX IF NOT EXISTS idx_appointments_store_status ON appointments(store_id, status);
CREATE INDEX IF NOT EXISTS idx_rooms_store ON rooms(store_id, active);
CREATE INDEX IF NOT EXISTS idx_bookings_store_dates ON bookings(store_id, check_in_date, check_out_date);
CREATE INDEX IF NOT EXISTS idx_bookings_store_status ON bookings(store_id, status);
CREATE INDEX IF NOT EXISTS idx_follow_up_store ON follow_up_logs(store_id, event_type);

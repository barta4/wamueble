-- =============================================
-- WaBot SaaS — Schema de Base de Datos PostgreSQL
-- =============================================

-- Tabla de Usuarios (SaaS auth)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'owner',
    store_id INTEGER,
    plan TEXT DEFAULT 'free',
    plan_expires_at TIMESTAMPTZ,
    email_verified INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Sesiones (persistidas en PostgreSQL)
CREATE TABLE IF NOT EXISTS session (
    sid VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
    sess JSON NOT NULL,
    expire TIMESTAMPTZ(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS IDX_session_expire ON session(expire);

-- Tabla de Locales/Tiendas
CREATE TABLE IF NOT EXISTS stores (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    admin_password TEXT,
    bot_name TEXT DEFAULT 'Bot',
    business_type TEXT DEFAULT 'general',
    ai_prompt TEXT DEFAULT '',
    categories JSONB DEFAULT '["General"]'::jsonb,
    theme_emoji TEXT DEFAULT '🏪',
    welcome_message TEXT DEFAULT '',
    currency TEXT DEFAULT 'USD',
    owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    plan TEXT DEFAULT 'free',
    plan_expires_at TIMESTAMPTZ,
    clinic_mode INTEGER DEFAULT 0,
    hostel_mode INTEGER DEFAULT 0,
    working_hours TEXT DEFAULT '08:00-20:00',
    slot_duration INTEGER DEFAULT 30,
    notify_phone TEXT DEFAULT '',
    notify_email TEXT DEFAULT '',
    notification_events JSONB DEFAULT '["new","ready"]'::jsonb,
    ai_provider TEXT DEFAULT 'openai',
    ai_model TEXT DEFAULT 'gpt-4o',
    ai_api_key TEXT DEFAULT '',
    whatsapp_provider TEXT DEFAULT 'baileys',
    whatsapp_status TEXT DEFAULT 'disconnected',
    orders_this_month INTEGER DEFAULT 0,
    last_active_at TIMESTAMPTZ,
    suspended INTEGER DEFAULT 0,
    suspended_reason TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Agregar FK de store_id a users
ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_store;
ALTER TABLE users ADD CONSTRAINT fk_users_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL;

-- Tabla de Repartidores
CREATE TABLE IF NOT EXISTS delivery_drivers (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Productos (Catálogo)
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC(12, 2) NOT NULL,
    category TEXT DEFAULT 'General',
    duration INTEGER DEFAULT 30,
    is_service INTEGER DEFAULT 0,
    available INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Clientes (CRM)
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    name TEXT,
    total_orders INTEGER DEFAULT 0,
    total_spent NUMERIC(12, 2) DEFAULT 0,
    bot_notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_store_customer_phone UNIQUE(store_id, phone)
);

-- Tabla de Pedidos
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    order_number TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_name TEXT,
    address TEXT NOT NULL,
    payment_method TEXT,
    status TEXT DEFAULT 'pending',
    total NUMERIC(12, 2) DEFAULT 0,
    notes TEXT,
    media_urls JSONB,
    driver_id INTEGER REFERENCES delivery_drivers(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ready_at TIMESTAMPTZ
);

-- Tabla de Items del Pedido
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_price NUMERIC(12, 2) NOT NULL,
    details TEXT
);

-- Tabla de Conversaciones
CREATE TABLE IF NOT EXISTS conversations (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    customer_phone TEXT NOT NULL,
    messages JSONB DEFAULT '[]'::jsonb,
    status TEXT DEFAULT 'active',
    needs_human INTEGER DEFAULT 0,
    is_favorite INTEGER DEFAULT 0,
    is_archived INTEGER DEFAULT 0,
    is_blocked INTEGER DEFAULT 0,
    is_deleted INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Conexiones a BD Externas
CREATE TABLE IF NOT EXISTS db_connections (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    db_type TEXT NOT NULL,
    host TEXT,
    port INTEGER,
    database_name TEXT,
    username TEXT,
    password_encrypted TEXT,
    table_name TEXT,
    column_mapping TEXT,
    last_sync TIMESTAMPTZ,
    active INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Doctores
CREATE TABLE IF NOT EXISTS doctors (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    specialty TEXT,
    active INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Citas (modo clínica)
CREATE TABLE IF NOT EXISTS appointments (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    appointment_number TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_name TEXT,
    service TEXT NOT NULL,
    doctor TEXT,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    duration INTEGER DEFAULT 30,
    total NUMERIC(12, 2) DEFAULT 0,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Habitaciones/Camas (modo hostel)
CREATE TABLE IF NOT EXISTS rooms (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    room_type TEXT DEFAULT 'shared_dorm',
    capacity INTEGER DEFAULT 1,
    price_per_night NUMERIC(12, 2) NOT NULL,
    total_units INTEGER DEFAULT 1,
    active INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Reservas de Hostel
CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    booking_number TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_name TEXT,
    room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
    room_name TEXT NOT NULL,
    check_in_date TEXT NOT NULL,
    check_out_date TEXT NOT NULL,
    guests_count INTEGER DEFAULT 1,
    total_price NUMERIC(12, 2) DEFAULT 0,
    payment_status TEXT DEFAULT 'pending',
    status TEXT DEFAULT 'pending',
    payment_method TEXT,
    notes TEXT,
    passport_info TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Conexiones WhatsApp Multitenant
CREATE TABLE IF NOT EXISTS whatsapp_connections (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    phone TEXT,
    mode TEXT DEFAULT 'baileys',
    meta_access_token TEXT,
    meta_phone_id TEXT,
    meta_verify_token TEXT,
    status TEXT DEFAULT 'disconnected',
    active INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Auditoría SaaS
CREATE TABLE IF NOT EXISTS saas_audit_log (
    id SERIAL PRIMARY KEY,
    admin_user_id INTEGER NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    target_type TEXT,
    target_id INTEGER,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Planes SaaS
CREATE TABLE IF NOT EXISTS saas_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price NUMERIC(12, 2) DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    interval TEXT DEFAULT 'month',
    description TEXT DEFAULT '',
    features JSONB DEFAULT '[]'::jsonb,
    limits JSONB DEFAULT '{}'::jsonb,
    active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Configuración General
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- TABLA DE COLA DE MENSAJES (MESSAGE QUEUE)
-- =============================================
CREATE TABLE IF NOT EXISTS message_queue (
    id BIGSERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
    customer_phone TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Seguimiento y Automatización Post-Atención
CREATE TABLE IF NOT EXISTS follow_up_logs (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    customer_phone TEXT NOT NULL,
    event_type TEXT NOT NULL,
    reference_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_pg_store_event_ref UNIQUE(store_id, event_type, reference_id)
);

-- Tabla de Campañas de Difusión Oficiales Meta
CREATE TABLE IF NOT EXISTS campaigns (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    template_name TEXT NOT NULL,
    language_code TEXT DEFAULT 'es',
    parameters_mapping TEXT,
    status TEXT DEFAULT 'draft',
    total_recipients INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaign_recipients (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    customer_phone TEXT NOT NULL,
    customer_name TEXT,
    status TEXT DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    error_message TEXT
);

-- Índices de alto rendimiento
CREATE INDEX IF NOT EXISTS idx_queue_status_created ON message_queue(status, created_at);
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
CREATE INDEX IF NOT EXISTS idx_follow_up_store_pg ON follow_up_logs(store_id, event_type);

-- =============================================
-- WaBot SaaS — Datos de Ejemplo (Seed)
-- =============================================

-- Superadmin de ejemplo (admin@urubot.com / admin123)
INSERT OR IGNORE INTO users (id, email, password_hash, name, role, email_verified, plan)
VALUES (1, 'admin@urubot.com', '$2b$10$E./PLIK9G6NEMTnBongTgOP8THDw.AOzCqv48kHHK/X2XjKMijvq6', 'Super Admin', 'superadmin', 1, 'enterprise');

-- Local de ejemplo
INSERT OR IGNORE INTO stores (id, name, phone, address, admin_password, bot_name, business_type, ai_prompt)
VALUES (1, 'Pizzería Don Pepe', '+59899111111', 'Av. 18 de Julio 1234, Montevideo', 'admin123', 'PepeBot', 'pizzería', 'Ofrecer fainá arriba de la pizza muzzarella.');

-- Repartidores de ejemplo
INSERT OR IGNORE INTO delivery_drivers (id, store_id, name, phone) VALUES
(1, 1, 'Carlos', '+59899000000'),
(2, 1, 'Diego', '+59899000001');

-- Catálogo de ejemplo
INSERT OR IGNORE INTO products (store_id, name, description, price, category, available) VALUES
(1, 'Pizza Muzzarella', 'Clásica con muzzarella y salsa de tomate', 350, 'Pizzas', 1),
(1, 'Pizza Napolitana', 'Muzzarella, tomate en rodajas y ajo', 380, 'Pizzas', 1),
(1, 'Pizza Fugazzeta', 'Doble capa de muzzarella con cebolla', 400, 'Pizzas', 1),
(1, 'Pizza Calabresa', 'Muzzarella con longaniza calabresa', 420, 'Pizzas', 1),
(1, 'Pizza 4 Quesos', 'Muzzarella, roquefort, parmesano y fontina', 450, 'Pizzas', 1),
(1, 'Fainá', 'Porción de fainá clásico', 120, 'Acompañamientos', 1),
(1, 'Empanada de Carne', 'Empanada al horno rellena de carne', 90, 'Empanadas', 1),
(1, 'Empanada de Jamón y Queso', 'Empanada al horno de jamón y queso', 90, 'Empanadas', 1),
(1, 'Coca-Cola 1.5L', 'Coca-Cola línea 1.5 litros', 150, 'Bebidas', 1),
(1, 'Agua Mineral 500ml', 'Agua mineral sin gas', 80, 'Bebidas', 1),
(1, 'Cerveza Patricia 1L', 'Cerveza Patricia retornable 1 litro', 180, 'Bebidas', 1),
(1, 'Postre Vigilante', 'Queso y dulce de membrillo', 200, 'Postres', 1);

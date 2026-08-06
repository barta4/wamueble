/**
 * Plantillas de Negocio predefinidas para WaBot SaaS.
 * Cada plantilla define: emoji, categorías, prompt de IA, y mensaje de bienvenida.
 */

const BUSINESS_TEMPLATES = {
    pizzeria: {
        emoji: '🍕',
        name: 'Pizzería',
        categories: ['Pizzas', 'Empanadas', 'Bebidas', 'Postres', 'Acompañamientos'],
        welcomeMessage: '¡Hola! Bienvenido a {store}. ¿Qué te gustaría pedir? 🍕',
        aiPrompt: 'Sos un asistente de una pizzería. Ayudá a los clientes a hacer pedidos de pizza, empanadas y bebidas. Ofrecé combos y sugerencias de acompañamientos.',
        sampleProducts: [
            { name: 'Pizza Muzzarella Grande', price: 380, category: 'Pizzas', description: 'Clásica pizza con salsa de tomate casera y abundante muzzarella.' },
            { name: 'Empanada de Carne (unidad)', price: 85, category: 'Empanadas', description: 'Carne cortada a cuchillo con aceitunas y huevo duro.' },
            { name: 'Fainá Tradicional', price: 90, category: 'Acompañamientos', description: 'Fainá bien crujiente de masa de garbanzos.' },
            { name: 'Refresco 1.5L', price: 160, category: 'Bebidas', description: 'Coca-Cola, Sprite o Fanta helada.' }
        ]
    },
    restaurante: {
        emoji: '🍽️',
        name: 'Restaurante',
        categories: ['Entradas', 'Platos Principales', 'Pastas', 'Parrilla', 'Bebidas', 'Postres'],
        welcomeMessage: '¡Bienvenido a {store}! ¿Qué le gustaría ordenar hoy? 🍽️',
        aiPrompt: 'Sos un asistente de restaurante. Ayudá a los clientes con el menú, sugerí platos del día y recomendaciones de maridaje.',
        sampleProducts: [
            { name: 'Milanesa Napolitana con Papas Fritas', price: 450, category: 'Platos Principales', description: 'Milanesa con jamón, queso muzzarella y salsa de tomate.' },
            { name: 'Ravioles de Jamón y Queso con Tuco', price: 420, category: 'Pastas', description: 'Pasta casera servida con tuco especial de carne.' },
            { name: 'Flan Casero con Dulce de Leche', price: 180, category: 'Postres', description: 'Flan con crema y dulce de leche de campo.' }
        ]
    },
    farmacia: {
        emoji: '💊',
        name: 'Farmacia',
        categories: ['Medicamentos', 'Dermocosméticos', 'Primeros Auxilios', 'Vitaminas', 'Higiene'],
        welcomeMessage: '💊 Hola, bienvenido a {store}. ¿En qué puedo ayudarte?',
        aiPrompt: 'Sos un asistente de farmacia. Ayudá a los clientes a encontrar productos de salud y bienestar. Si preguntan por medicamentos con receta, indicá que deben presentar la receta médica.',
        sampleProducts: [
            { name: 'Alcohol en Gel 500ml', price: 190, category: 'Higiene', description: 'Desinfectante de manos con glicerina.' },
            { name: 'Curitas Adhesivas x 20', price: 120, category: 'Primeros Auxilios', description: 'Tiras adhesivas resistentes al agua.' },
            { name: 'Vitamina C 1000mg efervescente', price: 340, category: 'Vitaminas', description: 'Tubo x 10 tabletas efervescentes sabor naranja.' }
        ]
    },
    tienda: {
        emoji: '🛍️',
        name: 'Tienda / Retail',
        categories: ['Ropa', 'Accesorios', 'Calzado', 'Electrónica', 'Hogar'],
        welcomeMessage: '🛍️ ¡Hola! Bienvenido a {store}. ¿Qué estás buscando?',
        aiPrompt: 'Sos un asistente de tienda. Ayudá a los clientes a encontrar productos, informá sobre talles, colores disponibles y promociones.',
        sampleProducts: [
            { name: 'Remera Básica de Algodón', price: 590, category: 'Ropa', description: '100% algodón, disponible en blanco, negro y gris.' },
            { name: 'Pantalón Jean Slim Fit', price: 1490, category: 'Ropa', description: 'Jean elastizado de tiro medio en azul oscuro.' },
            { name: 'Lentes de Sol Polarizados', price: 890, category: 'Accesorios', description: 'Protección UV400 con estuche incluido.' }
        ]
    },
    floristeria: {
        emoji: '🌸',
        name: 'Floristería',
        categories: ['Ramos', 'Plantas', 'Arreglos', 'Regalos', 'Eventos'],
        welcomeMessage: '🌸 ¡Hola! Bienvenido a {store}. ¿Buscás flores para alguna ocasión especial?',
        aiPrompt: 'Sos un asistente de floristería. Ayudá a los clientes a elegir arreglos florales, ramos y plantas. Preguntá por la ocasión para sugerir lo más adecuado.',
        sampleProducts: [
            { name: 'Ramo de 12 Rosas Rojas', price: 1200, category: 'Ramos', description: 'Rosas frescas importadas con follaje y envoltorio de regalo.' },
            { name: 'Orquídea en Maceta', price: 1600, category: 'Plantas', description: 'Planta de orquídea phalaenopsis florecida.' }
        ]
    },
    panaderia: {
        emoji: '🥖',
        name: 'Panadería',
        categories: ['Pan', 'Facturas', 'Tortas', 'Bebidas', 'Snacks'],
        welcomeMessage: '🥖 ¡Buenos días! Bienvenido a {store}. ¿Qué le gustaría llevar?',
        aiPrompt: 'Sos un asistente de panadería. Ayudá a los clientes con pedidos de pan, facturas y tortas. Si piden tortas personalizadas, indicá los tiempos de anticipación.',
        sampleProducts: [
            { name: 'Pan de Campo (Kilo)', price: 180, category: 'Pan', description: 'Pan elaborado con masa madre y corteza crujiente.' },
            { name: 'Docena de Facturas Surtidas', price: 380, category: 'Facturas', description: 'Medialunas de manteca, vigilantes y berlinesas.' }
        ]
    },
    carniceria: {
        emoji: '🥩',
        name: 'Carnicería',
        categories: ['Carnes Rojas', 'Carnes Blancas', 'Embutidos', 'Elaborados', 'Acompañamientos'],
        welcomeMessage: '🥩 ¡Hola! Bienvenido a {store}. ¿Qué carne le gustaría llevar?',
        aiPrompt: 'Sos un asistente de carnicería. Ayudá a los clientes a elegir cortes de carne, informá sobre preparaciones recomendadas y porciones.',
        sampleProducts: [
            { name: 'Asado de Tira (Kilo)', price: 420, category: 'Carnes Rojas', description: 'Corte tradicional de asado de primera calidad.' },
            { name: 'Chorizos de Cerdo x Kilo', price: 320, category: 'Embutidos', description: 'Chorizos criollos 100% carne de cerdo.' }
        ]
    },
    cafe: {
        emoji: '☕',
        name: 'Cafetería',
        categories: ['Cafés', 'Bebidas Frías', 'Pastelería', 'Sándwiches', 'Desayunos'],
        welcomeMessage: '☕ ¡Hola! Bienvenido a {store}. ¿Qué vas a tomar hoy?',
        aiPrompt: 'Sos un asistente de cafetería. Ayudá a los clientes con pedidos de café, bebidas y snacks. Sugerí combinaciones de desayuno o merienda.',
        sampleProducts: [
            { name: 'Café Espresso Doble', price: 140, category: 'Cafés', description: 'Café tostado de especialidad 100% arábica.' },
            { name: 'Sándwich Caliente de Jamón y Queso', price: 210, category: 'Sándwiches', description: 'Pan de molde tostado con abundante queso frito.' }
        ]
    },
    heladeria: {
        emoji: '🍦',
        name: 'Heladería',
        categories: ['Helados', 'Sugar Free', 'Frappés', 'Postres', 'Combos'],
        welcomeMessage: '🍦 ¡Hola! Bienvenido a {store}. ¿Qué gusto te gustaría?',
        aiPrompt: 'Sos un asistente de heladería. Ayudá a los clientes a elegir sabores, informá sobre topping disponibles y combos.',
        sampleProducts: [
            { name: 'Helado 1 Kilo (Hasta 4 sabores)', price: 680, category: 'Helados', description: 'Elegí entre Dulce de Leche Granizado, Frutilla a la Crema, Chocolate y Sambayón.' },
            { name: 'Cucurucho Gigante 2 Bochas', price: 220, category: 'Helados', description: 'Cucurucho artesanal de galleta crocante.' }
        ]
    },
    general: {
        emoji: '🏪',
        name: 'Negocio General',
        categories: ['General'],
        welcomeMessage: '🏪 ¡Hola! Bienvenido a {store}. ¿En qué puedo ayudarte?',
        aiPrompt: '',
        sampleProducts: [
            { name: 'Producto de Muestra A', price: 250, category: 'General', description: 'Descripción del producto de prueba.' }
        ]
    }
};

module.exports = BUSINESS_TEMPLATES;

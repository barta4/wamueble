/**
 * WaBot SaaS — Script de Configuración Rápida
 * Inicializa la base de datos con el schema y datos de ejemplo.
 * 
 * Uso: npm run setup
 */

const path = require('path');
const fs = require('fs');
const readline = require('readline');

// Cargar variables de entorno
require('dotenv').config();

const { getDb, initSchema, runSeed, closeDb } = require('../src/config/db');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question) {
    return new Promise(resolve => rl.question(question, resolve));
}

async function setup() {
    console.log('');
    console.log('🤖 ═══════════════════════════════════════');
    console.log('🤖  WaBot SaaS — Configuración Rápida');
    console.log('🤖 ═══════════════════════════════════════');
    console.log('');

    // Verificar si .env existe
    const envPath = path.join(__dirname, '..', '.env');
    const envExamplePath = path.join(__dirname, '..', '.env.example');

    if (!fs.existsSync(envPath)) {
        console.log('📋 Creando archivo .env desde .env.example...');
        fs.copyFileSync(envExamplePath, envPath);
        console.log('✅ Archivo .env creado. Editalo con tus claves antes de ejecutar.\n');
    }

    // Inicializar BD
    console.log('🗄️  Inicializando base de datos...');
    const db = getDb();

    // Verificar si ya tiene datos
    const storeCount = db.prepare('SELECT COUNT(*) as count FROM stores').get();

    if (storeCount.count === 0) {
        console.log('🌱 Cargando datos de ejemplo...');
        runSeed();
        console.log('✅ Datos de ejemplo cargados\n');
    } else {
        console.log(`✅ Base de datos ya tiene ${storeCount.count} local(es) configurado(s)\n`);
    }

    // Mostrar resumen
    const store = db.prepare('SELECT * FROM stores LIMIT 1').get();
    const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get();
    const driverCount = db.prepare('SELECT COUNT(*) as count FROM delivery_drivers').get();

    console.log('📊 Resumen:');
    console.log(`   Local: ${store.name}`);
    console.log(`   Teléfono WhatsApp: ${store.phone}`);
    console.log(`   Repartidores configurados: ${driverCount.count}`);
    console.log(`   Productos en catálogo: ${productCount.count}`);
    console.log(`   Contraseña admin: ${store.admin_password}`);
    console.log('');
    console.log('🚀 Para iniciar el servidor:');
    console.log('   npm run dev');
    console.log('');
    console.log('📺 Dashboard de Cocina:  http://localhost:3000/kitchen');
    console.log('⚙️  Panel de Admin:       http://localhost:3000/admin');
    console.log('🔗 Webhook (Evolution):  http://localhost:3000/webhook');
    console.log('');

    closeDb();
    rl.close();
}

setup().catch(err => {
    console.error('❌ Error en setup:', error.message);
    process.exit(1);
});

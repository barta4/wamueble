const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

let pool = null;

/**
 * Obtener o crear el pool de conexiones de PostgreSQL.
 */
function getPgPool() {
    if (pool) return pool;

    const connectionString = process.env.DATABASE_URL;

    if (connectionString) {
        pool = new Pool({
            connectionString,
            ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false
        });
    } else {
        pool = new Pool({
            host: process.env.PGHOST || 'localhost',
            port: parseInt(process.env.PGPORT || '5432'),
            user: process.env.PGUSER || 'postgres',
            password: process.env.PGPASSWORD || 'postgres',
            database: process.env.PGDATABASE || 'wabot_saas'
        });
    }

    pool.on('error', (err) => {
        console.error('❌ Unexpected error on idle PostgreSQL client:', err);
    });

    return pool;
}

/**
 * Ejecuta una consulta en PostgreSQL.
 */
async function query(text, params) {
    const p = getPgPool();
    return await p.query(text, params);
}

/**
 * Ejecutar transacción en PostgreSQL.
 */
async function transaction(callback) {
    const p = getPgPool();
    const client = await p.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

/**
 * Inicializar esquema PostgreSQL si no existe.
 */
async function initPgSchema() {
    try {
        const schemaPath = path.join(__dirname, '..', 'db', 'schema_pg.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
        await query(schemaSql);
        console.log('✅ Esquema de PostgreSQL inicializado correctamente');
    } catch (e) {
        console.error('❌ Error inicializando esquema PostgreSQL:', e.message);
    }
}

module.exports = {
    getPgPool,
    query,
    transaction,
    initPgSchema
};

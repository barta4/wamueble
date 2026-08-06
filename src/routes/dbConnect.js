/**
 * Rutas para conexión a bases de datos externas (MySQL, PostgreSQL, SQLite).
 * Permite al admin conectar su BD existente e importar productos.
 */

const express = require('express');
const router = express.Router();
const { getDb } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

function validateIdentifier(name) {
    return name && /^[a-zA-Z0-9_]+$/.test(name);
}

/**
 * POST /api/db-connect/test
 * Probar conexión a una base de datos externa.
 */
router.post('/test', requireAuth, async (req, res) => {
    try {
        const { dbType, host, port, database, username, password } = req.body;

        if (!dbType || !database) {
            return res.status(400).json({ error: 'Tipo de BD y nombre son requeridos' });
        }

        let connection;
        let testResult;

        switch (dbType) {
            case 'mysql':
                const mysql = require('mysql2/promise');
                connection = await mysql.createConnection({
                    host: host || 'localhost',
                    port: port || 3306,
                    user: username || 'root',
                    password: password || '',
                    database: database,
                    connectTimeout: 5000
                });
                const [mysqlResult] = await connection.query('SELECT 1 as test');
                testResult = mysqlResult[0].test === 1;
                await connection.end();
                break;

            case 'postgresql':
                const { Pool } = require('pg');
                const pgPool = new Pool({
                    host: host || 'localhost',
                    port: port || 5432,
                    user: username || 'postgres',
                    password: password || '',
                    database: database,
                    connectionTimeoutMillis: 5000
                });
                const pgResult = await pgPool.query('SELECT 1 as test');
                testResult = pgResult.rows[0].test === 1;
                await pgPool.end();
                break;

            case 'sqlite':
                const Database = require('better-sqlite3');
                // Para SQLite, el "host" es el path del archivo
                const sqliteDb = new Database(database);
                const sqliteResult = sqliteDb.prepare('SELECT 1 as test').get();
                testResult = sqliteResult.test === 1;
                sqliteDb.close();
                break;

            default:
                return res.status(400).json({ error: `Tipo de BD no soportado: ${dbType}` });
        }

        if (testResult) {
            res.json({ success: true, message: 'Conexión exitosa' });
        } else {
            res.status(500).json({ error: 'La conexión falló' });
        }

    } catch (error) {
        console.error('❌ Error probando conexión:', error.message);
        res.status(500).json({ error: `Error de conexión: ${error.message}` });
    }
});

/**
 * GET /api/db-connect/tables
 * Listar tablas de la BD externa conectada.
 */
router.get('/tables', requireAuth, async (req, res) => {
    try {
        const { dbType, host, port, database, username, password } = req.query;

        let tables = [];

        switch (dbType) {
            case 'mysql':
                const mysql = require('mysql2/promise');
                const mysqlConn = await mysql.createConnection({
                    host: host || 'localhost',
                    port: port || 3306,
                    user: username || 'root',
                    password: password || '',
                    database: database
                });
                const [mysqlTables] = await mysqlConn.query('SHOW TABLES');
                tables = mysqlTables.map(t => Object.values(t)[0]);
                await mysqlConn.end();
                break;

            case 'postgresql':
                const { Pool } = require('pg');
                const pgPool = new Pool({
                    host: host || 'localhost',
                    port: port || 5432,
                    user: username || 'postgres',
                    password: password || '',
                    database: database
                });
                const pgResult = await pgPool.query(`
                    SELECT tablename FROM pg_tables 
                    WHERE schemaname = 'public'
                    ORDER BY tablename
                `);
                tables = pgResult.rows.map(r => r.tablename);
                await pgPool.end();
                break;

            case 'sqlite':
                const Database = require('better-sqlite3');
                const sqliteDb = new Database(database);
                const sqliteTables = sqliteDb.prepare(`
                    SELECT name FROM sqlite_master 
                    WHERE type='table' AND name NOT LIKE 'sqlite_%'
                    ORDER BY name
                `).all();
                tables = sqliteTables.map(t => t.name);
                sqliteDb.close();
                break;

            default:
                return res.status(400).json({ error: `Tipo de BD no soportado: ${dbType}` });
        }

        res.json({ tables });

    } catch (error) {
        console.error('❌ Error listando tablas:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/db-connect/schema/:table
 * Obtener esquema (columnas) de una tabla específica.
 */
router.get('/schema/:table', requireAuth, async (req, res) => {
    try {
        const { table } = req.params;
        if (!validateIdentifier(table)) {
            return res.status(400).json({ error: "Nombre de tabla inválido. Solo se permiten caracteres alfanuméricos y guiones bajos." });
        }
        const { dbType, host, port, database, username, password } = req.query;

        let columns = [];

        switch (dbType) {
            case 'mysql':
                const mysql = require('mysql2/promise');
                const mysqlConn = await mysql.createConnection({
                    host: host || 'localhost',
                    port: port || 3306,
                    user: username || 'root',
                    password: password || '',
                    database: database
                });
                const [mysqlCols] = await mysqlConn.query(`DESCRIBE \`${table}\``);
                columns = mysqlCols.map(c => ({
                    name: c.Field,
                    type: c.Type,
                    nullable: c.Null === 'YES'
                }));
                await mysqlConn.end();
                break;

            case 'postgresql':
                const { Pool } = require('pg');
                const pgPool = new Pool({
                    host: host || 'localhost',
                    port: port || 5432,
                    user: username || 'postgres',
                    password: password || '',
                    database: database
                });
                const pgResult = await pgPool.query(`
                    SELECT column_name as name, data_type as type, is_nullable as nullable
                    FROM information_schema.columns
                    WHERE table_name = $1 AND table_schema = 'public'
                    ORDER BY ordinal_position
                `, [table]);
                columns = pgResult.rows.map(c => ({
                    name: c.name,
                    type: c.type,
                    nullable: c.nullable === 'YES'
                }));
                await pgPool.end();
                break;

            case 'sqlite':
                const Database = require('better-sqlite3');
                const sqliteDb = new Database(database);
                const sqliteCols = sqliteDb.prepare(`PRAGMA table_info(?)`).all(table);
                columns = sqliteCols.map(c => ({
                    name: c.name,
                    type: c.type,
                    nullable: c.notnull === 0
                }));
                sqliteDb.close();
                break;

            default:
                return res.status(400).json({ error: `Tipo de BD no soportado: ${dbType}` });
        }

        res.json({ columns });

    } catch (error) {
        console.error('❌ Error obteniendo esquema:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/db-connect/preview
 * Preview de los primeros N registros de una tabla.
 */
router.post('/preview', requireAuth, async (req, res) => {
    try {
        const { dbType, host, port, database, username, password, table, limit = 10 } = req.body;
        if (!validateIdentifier(table)) {
            return res.status(400).json({ error: "Nombre de tabla inválido." });
        }

        let rows = [];

        switch (dbType) {
            case 'mysql':
                const mysql = require('mysql2/promise');
                const mysqlConn = await mysql.createConnection({
                    host: host || 'localhost',
                    port: port || 3306,
                    user: username || 'root',
                    password: password || '',
                    database: database
                });
                const [mysqlRows] = await mysqlConn.query(`SELECT * FROM \`${table}\` LIMIT ?`, [limit]);
                rows = mysqlRows;
                await mysqlConn.end();
                break;

            case 'postgresql':
                const { Pool } = require('pg');
                const pgPool = new Pool({
                    host: host || 'localhost',
                    port: port || 5432,
                    user: username || 'postgres',
                    password: password || '',
                    database: database
                });
                const pgResult = await pgPool.query(`SELECT * FROM "${table}" LIMIT $1`, [limit]);
                rows = pgResult.rows;
                await pgPool.end();
                break;

            case 'sqlite':
                const Database = require('better-sqlite3');
                const sqliteDb = new Database(database);
                rows = sqliteDb.prepare(`SELECT * FROM "${table}" LIMIT ?`).all(limit);
                sqliteDb.close();
                break;

            default:
                return res.status(400).json({ error: `Tipo de BD no soportado: ${dbType}` });
        }

        res.json({ rows, count: rows.length });

    } catch (error) {
        console.error('❌ Error en preview:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/db-connect/import
 * Importar productos desde una tabla externa.
 */
router.post('/import', requireAuth, async (req, res) => {
    try {
        const { dbType, host, port, database, username, password, table, columnMapping, storeId } = req.body;

        if (!table || !columnMapping) {
            return res.status(400).json({ error: 'Tabla y mapeo de columnas son requeridos' });
        }

        const db = getDb();
        const targetStoreId = req.user.store_id;

        // columnMapping: { nombre: 'col_name', precio: 'col_price', descripcion: 'col_desc', categoria: 'col_cat' }
        const nameCol = columnMapping.nombre;
        const priceCol = columnMapping.precio;
        const descCol = columnMapping.descripcion || null;
        const catCol = columnMapping.categoria || null;

        if (!validateIdentifier(table) || !validateIdentifier(nameCol) || !validateIdentifier(priceCol) || (descCol && !validateIdentifier(descCol)) || (catCol && !validateIdentifier(catCol))) {
            return res.status(400).json({ error: 'Nombres de tabla o columnas inválidos. Deben contener solo caracteres alfanuméricos y guiones bajos.' });
        }

        if (!nameCol || !priceCol) {
            return res.status(400).json({ error: 'Mapeo de nombre y precio son requeridos' });
        }

        let rows = [];

        switch (dbType) {
            case 'mysql':
                const mysql = require('mysql2/promise');
                const mysqlConn = await mysql.createConnection({
                    host: host || 'localhost',
                    port: port || 3306,
                    user: username || 'root',
                    password: password || '',
                    database: database
                });
                let selectCols = `\`${nameCol}\`, \`${priceCol}\``;
                if (descCol) selectCols += `, \`${descCol}\``;
                if (catCol) selectCols += `, \`${catCol}\``;
                const [mysqlRows] = await mysqlConn.query(`SELECT ${selectCols} FROM \`${table}\``);
                rows = mysqlRows;
                await mysqlConn.end();
                break;

            case 'postgresql':
                const { Pool } = require('pg');
                const pgPool = new Pool({
                    host: host || 'localhost',
                    port: port || 5432,
                    user: username || 'postgres',
                    password: password || '',
                    database: database
                });
                let pgSelectCols = `"${nameCol}", "${priceCol}"`;
                if (descCol) pgSelectCols += `, "${descCol}"`;
                if (catCol) pgSelectCols += `, "${catCol}"`;
                const pgResult = await pgPool.query(`SELECT ${pgSelectCols} FROM "${table}"`);
                rows = pgResult.rows;
                await pgPool.end();
                break;

            case 'sqlite':
                const Database = require('better-sqlite3');
                const sqliteDb = new Database(database);
                let sqliteSelectCols = `"${nameCol}", "${priceCol}"`;
                if (descCol) sqliteSelectCols += `, "${descCol}"`;
                if (catCol) sqliteSelectCols += `, "${catCol}"`;
                rows = sqliteDb.prepare(`SELECT ${sqliteSelectCols} FROM "${table}"`).all();
                sqliteDb.close();
                break;

            default:
                return res.status(400).json({ error: `Tipo de BD no soportado: ${dbType}` });
        }

        // Insertar productos en la BD interna
        const insertProduct = db.prepare(`
            INSERT INTO products (store_id, name, description, price, category)
            VALUES (?, ?, ?, ?, ?)
        `);

        let imported = 0;
        let errors = 0;

        const importTransaction = db.transaction(() => {
            for (const row of rows) {
                try {
                    const name = String(row[nameCol] || '').trim();
                    const price = parseFloat(row[priceCol]) || 0;
                    const description = descCol ? String(row[descCol] || '') : '';
                    const category = catCol ? String(row[catCol] || 'General') : 'General';

                    if (name && price > 0) {
                        insertProduct.run(targetStoreId, name, description, price, category);
                        imported++;
                    } else {
                        errors++;
                    }
                } catch (e) {
                    errors++;
                }
            }
        });

        importTransaction();

        // Guardar configuración de conexión
        try {
            db.prepare(`
                INSERT OR REPLACE INTO settings (key, value, updated_at)
                VALUES ('db_connection_config', ?, CURRENT_TIMESTAMP)
            `).run(JSON.stringify({
                dbType, host, port, database, table, columnMapping
            }));
        } catch (e) {
            console.warn('⚠️ No se pudo guardar la configuración de conexión:', e.message);
        }

        console.log(`📥 Importación completada: ${imported} productos importados, ${errors} errores`);

        res.json({ 
            success: true, 
            imported, 
            errors, 
            message: `${imported} productos importados exitosamente` 
        });

    } catch (error) {
        console.error('❌ Error importando productos:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/db-connect/config
 * Obtener la configuración de conexión guardada.
 */
router.get('/config', requireAuth, (req, res) => {
    try {
        const db = getDb();
        const row = db.prepare("SELECT value FROM settings WHERE key = 'db_connection_config'").get();
        
        if (row) {
            res.json(JSON.parse(row.value));
        } else {
            res.json(null);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

const Database = require('better-sqlite3');
const db = new Database(':memory:');
db.exec(`CREATE TABLE t(id INTEGER PRIMARY KEY, name TEXT)`);
db.exec(`INSERT INTO t(id,name) VALUES (1,'a')`);
try {
    db.exec(`ALTER TABLE t ADD COLUMN ev TEXT DEFAULT '["new","ready"]'`);
} catch (e) { console.log('ALTER err:', e.message); }
const r = db.prepare('SELECT * FROM t WHERE id = 1').get();
console.log('row:', JSON.stringify(r));

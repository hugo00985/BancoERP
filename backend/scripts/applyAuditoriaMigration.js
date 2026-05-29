const fs = require('fs');
const path = require('path');
const db = require('../config/db');

function assertSafeMigration(sql) {
    const forbidden = /\bDROP\b/i;

    if (forbidden.test(sql)) {
        throw new Error('La migracion de auditoria contiene DROP y fue bloqueada por seguridad.');
    }
}

async function main() {
    const migrationPath = path.join(__dirname, '..', '..', 'database', 'migration_auditoria.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    assertSafeMigration(sql);

    await db.pool.query(sql);
    console.log('Migracion de auditoria aplicada correctamente.');
}

main()
    .catch((error) => {
        console.error('Error aplicando migracion de auditoria:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await db.pool.end();
    });

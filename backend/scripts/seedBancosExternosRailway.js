const db = require('../config/db');

const bancosExternos = [
    {
        nombre: 'Banco Los Canchitos',
        swift: 'GTBC6968',
        baseUrl: 'https://api-proyecto-production-c611.up.railway.app',
        endpointValidacion: '/api/transferencias',
        endpointTransferencia: '/api/transferencias',
        activo: true
    },
    {
        nombre: 'NovaBank',
        swift: 'GTB666',
        baseUrl: 'https://apibanca.onrender.com',
        endpointValidacion: '/api/transferencias/interbancaria/entrante',
        endpointTransferencia: '/api/transferencias/interbancaria/entrante',
        activo: true
    },
    {
        nombre: 'Turbio Bank',
        swift: 'GTTBXXXX',
        baseUrl: 'https://repo-banco-api-desarrollo.up.railway.app',
        endpointValidacion: '/api/transferencia/validar',
        endpointTransferencia: '/api/transferencia/validar',
        activo: true
    }
];

async function assertTableExists() {
    const [tables] = await db.query(
        `SELECT 1
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name = 'bancos_externos'
         LIMIT 1`
    );

    if (!tables.length) {
        throw new Error('No existe la tabla bancos_externos. Ejecuta primero la migracion/schema de PostgreSQL.');
    }
}

async function upsertBanco(banco) {
    const [rows] = await db.query(
        `INSERT INTO bancos_externos
         (nombre, swift, base_url, endpoint_validacion, endpoint_transferencia, activo, fecha_actualizacion)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (swift)
         DO UPDATE SET
             nombre = EXCLUDED.nombre,
             base_url = EXCLUDED.base_url,
             endpoint_validacion = EXCLUDED.endpoint_validacion,
             endpoint_transferencia = EXCLUDED.endpoint_transferencia,
             activo = EXCLUDED.activo,
             fecha_actualizacion = NOW()
         RETURNING id_banco_externo, nombre, swift`,
        [
            banco.nombre,
            banco.swift,
            banco.baseUrl,
            banco.endpointValidacion,
            banco.endpointTransferencia,
            banco.activo
        ]
    );

    return rows[0];
}

async function main() {
    await assertTableExists();

    for (const banco of bancosExternos) {
        const result = await upsertBanco(banco);
        console.log(`Banco externo listo: ${result.nombre} (${result.swift}) id=${result.id_banco_externo}`);
    }

    console.log('Seed de bancos externos aplicado correctamente.');
}

main()
    .catch((error) => {
        console.error('Error aplicando seed de bancos externos:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await db.pool.end();
    });

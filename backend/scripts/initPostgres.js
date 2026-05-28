const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

function parseSslConfig() {
    const value = String(process.env.DB_SSL || '').trim().toLowerCase();
    const databaseUrl = String(process.env.DATABASE_URL || '').trim();

    if (value === 'true' || value === '1' || value === 'require') {
        return { rejectUnauthorized: false };
    }

    if (isRailwayDatabaseUrl(databaseUrl)) {
        return { rejectUnauthorized: false };
    }

    return null;
}

function isRailwayDatabaseUrl(databaseUrl) {
    if (!databaseUrl) {
        return false;
    }

    try {
        const { hostname } = new URL(databaseUrl);
        const host = hostname.toLowerCase();

        return host.includes('railway') || host.endsWith('.rlwy.net');
    } catch (error) {
        return false;
    }
}

function createClientConfig() {
    const ssl = parseSslConfig();
    const databaseUrl = String(process.env.DATABASE_URL || '').trim();

    if (databaseUrl) {
        const config = {
            connectionString: databaseUrl
        };

        if (ssl) {
            config.ssl = ssl;
        }

        return config;
    }

    const config = {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        user: process.env.DB_USER || 'postgres',
        database: process.env.DB_NAME || 'bancogt_db'
    };
    const password = process.env.DB_PASSWORD;

    if (password) {
        config.password = password;
    }

    if (ssl) {
        config.ssl = ssl;
    }

    return config;
}

function getConnectionInfo(config) {
    if (config.connectionString) {
        try {
            const parsed = new URL(config.connectionString);

            return {
                host: parsed.hostname,
                port: parsed.port || '5432',
                database: parsed.pathname.replace('/', '') || '(sin nombre)',
                ssl: Boolean(config.ssl)
            };
        } catch (error) {
            return {
                host: '(DATABASE_URL invalida)',
                port: '(desconocido)',
                database: '(desconocida)',
                ssl: Boolean(config.ssl)
            };
        }
    }

    return {
        host: config.host,
        port: config.port,
        database: config.database,
        ssl: Boolean(config.ssl)
    };
}

function logConnectionInfo(config) {
    const info = getConnectionInfo(config);

    console.log('[PostgreSQL init] Conexion configurada:', {
        host: info.host,
        port: info.port,
        database: info.database,
        ssl: info.ssl ? 'enabled' : 'disabled'
    });
}

async function main() {
    const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema_postgres.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    const clientConfig = createClientConfig();
    const client = new Client(clientConfig);
    let connected = false;

    logConnectionInfo(clientConfig);

    try {
        await client.connect();
        connected = true;
        await client.query(schema);
    } finally {
        if (connected) {
            await client.end();
        }
    }

    console.log('Base de datos PostgreSQL inicializada correctamente.');
}

main().catch((error) => {
    console.error('Error inicializando PostgreSQL:', error.message);
    process.exit(1);
});

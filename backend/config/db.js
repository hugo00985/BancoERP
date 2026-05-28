const { Pool } = require('pg');
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

function createPoolConfig() {
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

    console.log('[PostgreSQL] Conexion configurada:', {
        host: info.host,
        port: info.port,
        database: info.database,
        ssl: info.ssl ? 'enabled' : 'disabled'
    });
}

function addCompatibilityMetadata(rows, result) {
    if (Array.isArray(rows)) {
        const firstRow = rows[0] || {};
        const idKey = Object.keys(firstRow).find((key) => /^id($|_)/.test(key));

        rows.insertId = firstRow.id || (idKey ? firstRow[idKey] : undefined);
        rows.affectedRows = result.rowCount;
    }

    return rows;
}

const poolConfig = createPoolConfig();
logConnectionInfo(poolConfig);

const pool = new Pool(poolConfig);

async function query(text, params = []) {
    const result = await pool.query(text, params);
    const rows = addCompatibilityMetadata(result.rows, result);

    return [rows, result];
}

async function getConnection() {
    const client = await pool.connect();

    return {
        async beginTransaction() {
            await client.query('BEGIN');
        },
        async commit() {
            await client.query('COMMIT');
        },
        async rollback() {
            await client.query('ROLLBACK');
        },
        async query(text, params = []) {
            const result = await client.query(text, params);
            const rows = addCompatibilityMetadata(result.rows, result);

            return [rows, result];
        },
        release() {
            client.release();
        }
    };
}

module.exports = {
    query,
    getConnection,
    pool
};

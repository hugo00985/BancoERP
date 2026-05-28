const db = require('../config/db');

let warnedMissingTable = false;

const SENSITIVE_KEYS = new Set([
    'password',
    'password_hash',
    'nueva_password',
    'confirmar_password',
    'token',
    'authorization',
    'telegram_bot_token',
    'api_key',
    'x-api-key'
]);

function getClientIp(req) {
    const forwarded = req?.headers?.['x-forwarded-for'];

    if (forwarded) {
        return String(forwarded).split(',')[0].trim();
    }

    return req?.ip || req?.socket?.remoteAddress || null;
}

function sanitizeMetadata(value, depth = 0) {
    if (depth > 4) {
        return '[MAX_DEPTH]';
    }

    if (value === null || value === undefined) {
        return value;
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (Array.isArray(value)) {
        return value.slice(0, 50).map(item => sanitizeMetadata(item, depth + 1));
    }

    if (typeof value === 'object') {
        return Object.entries(value).reduce((acc, [key, item]) => {
            const normalizedKey = String(key).toLowerCase();
            acc[key] = SENSITIVE_KEYS.has(normalizedKey)
                ? '[REDACTED]'
                : sanitizeMetadata(item, depth + 1);
            return acc;
        }, {});
    }

    const text = String(value);
    return text.length > 1500 ? `${text.slice(0, 1500)}...` : value;
}

function getUserContext(req, fallback = {}) {
    const user = req?.user || fallback.user || {};

    return {
        id_usuario: user.id_usuario || user.id || fallback.id_usuario || null,
        username: user.username || user.nombre_usuario || fallback.username || null,
        rol: user.rol || fallback.rol || null
    };
}

async function registrarEventoAuditoria({
    req = null,
    user = null,
    id_usuario = null,
    username = null,
    rol = null,
    accion,
    modulo,
    descripcion = '',
    estado = 'OK',
    metadata = {}
}) {
    if (!accion || !modulo) {
        return null;
    }

    const context = getUserContext(req, { user, id_usuario, username, rol });
    const ip = getClientIp(req);
    const userAgent = req?.headers?.['user-agent'] || null;

    try {
        const [rows] = await db.query(
            `INSERT INTO auditoria_eventos
             (id_usuario, username, rol, accion, modulo, descripcion, ip, user_agent, estado, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
             RETURNING id`,
            [
                context.id_usuario,
                context.username,
                context.rol,
                String(accion).toUpperCase(),
                String(modulo).toUpperCase(),
                descripcion || null,
                ip,
                userAgent,
                String(estado || 'OK').toUpperCase(),
                JSON.stringify(sanitizeMetadata(metadata || {}))
            ]
        );

        return rows[0] || null;
    } catch (error) {
        if (error.code === '42P01') {
            if (!warnedMissingTable) {
                warnedMissingTable = true;
                console.warn('[Auditoria] tabla auditoria_eventos no existe. Ejecuta database/migration_auditoria.sql');
            }
            return null;
        }

        console.error('[Auditoria] error registrando evento:', error.message);
        return null;
    }
}

function addFilter(where, params, clause, value) {
    if (value === undefined || value === null || value === '') {
        return;
    }

    params.push(value);
    where.push(clause.replace('?', `$${params.length}`));
}

function normalizeLimit(value, fallback = 100, max = 500) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(Math.floor(parsed), max);
}

function normalizeOffset(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
}

async function listarEventosAuditoria(filters = {}) {
    const where = [];
    const params = [];
    const limit = normalizeLimit(filters.limit, 100, 500);
    const offset = normalizeOffset(filters.offset);

    addFilter(where, params, 'username ILIKE ?', filters.username ? `%${filters.username}%` : '');
    addFilter(where, params, 'modulo = ?', filters.modulo ? String(filters.modulo).toUpperCase() : '');
    addFilter(where, params, 'accion = ?', filters.accion ? String(filters.accion).toUpperCase() : '');
    addFilter(where, params, 'estado = ?', filters.estado ? String(filters.estado).toUpperCase() : '');

    if (filters.fechaDesde) {
        params.push(filters.fechaDesde);
        where.push(`fecha::date >= $${params.length}`);
    }

    if (filters.fechaHasta) {
        params.push(filters.fechaHasta);
        where.push(`fecha::date <= $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit);
    const limitParam = `$${params.length}`;
    params.push(offset);
    const offsetParam = `$${params.length}`;

    const [eventos] = await db.query(
        `SELECT id,
                id_usuario,
                username,
                rol,
                accion,
                modulo,
                descripcion,
                ip,
                user_agent,
                estado,
                metadata,
                fecha
         FROM auditoria_eventos
         ${whereSql}
         ORDER BY fecha DESC
         LIMIT ${limitParam}
         OFFSET ${offsetParam}`,
        params
    );

    return eventos;
}

async function obtenerResumenAuditoria(filters = {}) {
    const where = [];
    const params = [];

    if (filters.fechaDesde) {
        params.push(filters.fechaDesde);
        where.push(`fecha::date >= $${params.length}`);
    }

    if (filters.fechaHasta) {
        params.push(filters.fechaHasta);
        where.push(`fecha::date <= $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [totales] = await db.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE estado = 'OK')::int AS exitosos,
                COUNT(*) FILTER (WHERE estado IN ('ERROR', 'FALLIDO'))::int AS fallidos,
                COUNT(*) FILTER (WHERE estado = 'DENEGADO')::int AS denegados
         FROM auditoria_eventos
         ${whereSql}`,
        params
    );

    const [porModulo] = await db.query(
        `SELECT modulo, COUNT(*)::int AS total
         FROM auditoria_eventos
         ${whereSql}
         GROUP BY modulo
         ORDER BY total DESC
         LIMIT 12`,
        params
    );

    const [porAccion] = await db.query(
        `SELECT accion, COUNT(*)::int AS total
         FROM auditoria_eventos
         ${whereSql}
         GROUP BY accion
         ORDER BY total DESC
         LIMIT 12`,
        params
    );

    const [porEstado] = await db.query(
        `SELECT estado, COUNT(*)::int AS total
         FROM auditoria_eventos
         ${whereSql}
         GROUP BY estado
         ORDER BY total DESC`,
        params
    );

    return {
        total: totales[0]?.total || 0,
        exitosos: totales[0]?.exitosos || 0,
        fallidos: totales[0]?.fallidos || 0,
        denegados: totales[0]?.denegados || 0,
        porModulo,
        porAccion,
        porEstado
    };
}

module.exports = {
    getClientIp,
    listarEventosAuditoria,
    obtenerResumenAuditoria,
    registrarEventoAuditoria,
    sanitizeMetadata
};

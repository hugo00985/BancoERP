const db = require('../config/db');

function normalizeSwift(swift) {
    return String(swift || '').trim().toUpperCase();
}

function normalizeEndpoint(endpoint) {
    const value = String(endpoint || '').trim();
    return value || '/';
}

function normalizeBancoExterno(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.id ?? row.id_banco ?? row.id_banco_externo,
        nombre: row.nombre,
        swift: normalizeSwift(row.swift),
        baseUrl: row.baseUrl ?? row.baseurl ?? row.base_url,
        endpointValidacion: row.endpointValidacion ?? row.endpointvalidacion ?? row.endpoint_validacion,
        endpointTransferencia: row.endpointTransferencia ?? row.endpointtransferencia ?? row.endpoint_transferencia,
        token: row.token ?? row.apiKey ?? row.apikey ?? row.api_key ?? row.apiToken ?? row.apitoken ?? row.api_token,
        activo: row.activo
    };
}

function buildEndpointUrl(baseUrl, endpoint) {
    const cleanBase = String(baseUrl || '').trim();
    const cleanEndpoint = normalizeEndpoint(endpoint).replace(/^\/+/, '');

    if (!cleanBase) {
        throw new Error('El banco externo no tiene baseUrl configurado');
    }

    return new URL(cleanEndpoint, cleanBase.endsWith('/') ? cleanBase : `${cleanBase}/`).toString();
}

async function listarBancosExternos({ soloActivos = true } = {}) {
    const where = soloActivos ? 'WHERE activo = TRUE' : '';
    const [bancos] = await db.query(
        `SELECT *
         FROM bancos_externos
         ${where}
         ORDER BY nombre ASC`
    );

    return bancos.map(normalizeBancoExterno);
}

async function obtenerBancoPorSwift(swift) {
    const swiftNormalizado = normalizeSwift(swift);

    const [bancos] = await db.query(
        `SELECT *
         FROM bancos_externos
         WHERE swift = $1 AND activo = TRUE
         LIMIT 1`,
        [swiftNormalizado]
    );

    return normalizeBancoExterno(bancos[0]);
}

module.exports = {
    buildEndpointUrl,
    listarBancosExternos,
    normalizeBancoExterno,
    normalizeSwift,
    obtenerBancoPorSwift
};

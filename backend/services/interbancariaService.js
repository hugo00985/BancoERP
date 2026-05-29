const crypto = require('crypto');
const db = require('../config/db');
const {
    buildEndpointUrl,
    normalizeBancoExterno,
    normalizeSwift,
    obtenerBancoPorSwift
} = require('./bancosExternosService');
const {
    buildStandardInterbankPayload,
    getInterbankAdapter,
} = require('../integrations/interbank/adapters');

const LOCAL_BANK_NAME = process.env.BANK_NAME || 'Banco Industrial';
const LOCAL_BANK_SWIFT = normalizeSwift(process.env.LOCAL_BANK_SWIFT || 'BIGT2026');
const DEFAULT_TIMEOUT_MS = Number(process.env.INTERBANK_REQUEST_TIMEOUT_MS || 10000);

console.log(`[Interbank] LOCAL_BANK_SWIFT=${LOCAL_BANK_SWIFT}`);

class InterbankError extends Error {
    constructor(statusCode, message, details = null) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
    }
}

function createReference(prefix) {
    return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function pad2(value) {
    return String(value).padStart(2, '0');
}

function createStandardTransactionId() {
    const now = new Date();
    const datePart = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
    const timePart = `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
    const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();

    return `${LOCAL_BANK_SWIFT}-${datePart}-${timePart}-${suffix}`;
}

function hashApiKey(apiKey) {
    return crypto.createHash('sha256').update(String(apiKey)).digest('hex');
}

function parseAmount(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount) || amount <= 0) {
        throw new InterbankError(400, 'El monto debe ser mayor a cero');
    }

    return Number(amount.toFixed(2));
}

function getFirstValue(source, keys) {
    for (const key of keys) {
        if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
            return source[key];
        }
    }

    return null;
}

function normalizeEstado(value, fallback = 'CONFIRMADA') {
    const estado = String(value || '').trim().toUpperCase();

    if (estado.includes('PEND')) return 'PENDIENTE';
    if (estado.includes('CONF') || estado.includes('COMPLET')) return 'CONFIRMADA';
    if (estado.includes('RECH') || estado.includes('FAIL')) return 'RECHAZADA';
    if (estado.includes('ERROR')) return 'ERROR';

    return fallback;
}

function isNumericIdentifier(value) {
    if (typeof value === 'number') {
        return Number.isInteger(value);
    }

    return typeof value === 'string' && /^\d+$/.test(value.trim());
}

function isPrivilegedRole(user) {
    return ['ADMIN', 'CAJERO', 'GERENTE'].includes(user?.rol);
}

async function getClienteIdFromUser(user, connection = db) {
    if (user?.id_cliente) {
        return Number(user.id_cliente);
    }

    if (!user?.id_usuario) {
        return null;
    }

    const [usuarios] = await connection.query(
        `SELECT COALESCE(u.id_cliente, cl.id_cliente) AS id_cliente
         FROM usuario u
         LEFT JOIN cliente cl ON cl.id_usuario = u.id_usuario
         WHERE u.id_usuario = $1
         LIMIT 1`,
        [user.id_usuario]
    );

    return usuarios[0]?.id_cliente ? Number(usuarios[0].id_cliente) : null;
}

async function getUsuarioPorClienteId(idCliente, connection = db) {
    if (!idCliente) {
        return null;
    }

    const [usuarios] = await connection.query(
        `SELECT u.id_usuario, u.nombre_usuario
         FROM cliente cl
         JOIN usuario u ON u.id_usuario = cl.id_usuario OR u.id_cliente = cl.id_cliente
         WHERE cl.id_cliente = $1
           AND u.estado = TRUE
         LIMIT 1`,
        [idCliente]
    );

    return usuarios[0] || null;
}

function canUseAccount(userClienteId, cuenta) {
    return Number(cuenta.id_cliente) === Number(userClienteId);
}

function createJsonLog(data) {
    return JSON.stringify(data || {});
}

function normalizeAccountNumber(value) {
    if (value === undefined || value === null) {
        return null;
    }

    const normalized = String(value).trim();
    return normalized || null;
}

function hasRequiredValue(value) {
    return value !== undefined
        && value !== null
        && String(value).trim() !== '';
}

function validateStandardApiPayload(payload) {
    const requiredFields = [
        'TransactionID',
        'cuentaOrigen',
        'swiftOrigen',
        'cuentaDestino',
        'swiftDestino',
        'NombreOrigen',
        'monto'
    ];
    const missing = requiredFields.filter((field) => !hasRequiredValue(payload[field]));

    if (missing.length > 0) {
        throw new InterbankError(400, `Campos requeridos faltantes: ${missing.join(', ')}`);
    }

    return {
        TransactionID: String(payload.TransactionID).trim(),
        cuentaOrigen: normalizeAccountNumber(payload.cuentaOrigen),
        swiftOrigen: normalizeSwift(payload.swiftOrigen),
        cuentaDestino: normalizeAccountNumber(payload.cuentaDestino),
        swiftDestino: normalizeSwift(payload.swiftDestino),
        NombreOrigen: String(payload.NombreOrigen).trim(),
        monto: parseAmount(payload.monto),
        descripcion: String(payload.descripcion || '').trim()
    };
}

function normalizeStandardIncomingPayload(body = {}) {
    const standardPayload = validateStandardApiPayload({
        TransactionID: body.TransactionID,
        cuentaOrigen: body.cuentaOrigen,
        swiftOrigen: body.swiftOrigen,
        cuentaDestino: body.cuentaDestino,
        swiftDestino: body.swiftDestino,
        NombreOrigen: body.NombreOrigen,
        monto: body.monto,
        descripcion: body.descripcion
    });

    return {
        swiftOrigen: standardPayload.swiftOrigen,
        swiftDestino: standardPayload.swiftDestino,
        cuentaOrigen: standardPayload.cuentaOrigen,
        cuentaDestino: standardPayload.cuentaDestino,
        nombreOrigen: standardPayload.NombreOrigen,
        nombreDestino: null,
        monto: standardPayload.monto,
        moneda: 'GTQ',
        descripcion: standardPayload.descripcion || 'Transferencia interbancaria recibida',
        referencia: standardPayload.TransactionID,
        idempotencyKey: standardPayload.TransactionID,
        standardPayload,
        raw: body
    };
}

function getExternalBankToken(bancoExterno) {
    const swift = normalizeSwift(bancoExterno?.swift);
    const envKey = swift ? `INTERBANK_TOKEN_${swift.replace(/[^A-Z0-9_]/g, '_')}` : null;
    const envToken = envKey && typeof process.env[envKey] === 'string'
        ? process.env[envKey].trim()
        : null;
    const storedToken = typeof bancoExterno?.token === 'string'
        ? bancoExterno.token.trim()
        : bancoExterno?.token;
    const token = storedToken || envToken;

    return typeof token === 'string' ? token.trim() : token;
}

function buildExternalAuthHeaders(bancoExterno) {
    const token = getExternalBankToken(bancoExterno);

    if (!token) {
        return {};
    }

    return {
        Authorization: `Bearer ${token}`
    };
}

function redactHeaders(headers) {
    const redacted = { ...headers };

    if (redacted.Authorization) {
        redacted.Authorization = 'Bearer ***';
    }

    if (redacted['X-API-Key']) {
        redacted['X-API-Key'] = '***';
    }

    return redacted;
}

function logInterbankRequest(swift, request) {
    if (!swift) return;

    console.log(`[Interbank][${swift}][REQUEST]`, {
        ...request,
        headers: redactHeaders(request.headers || {})
    });
}

function logInterbankResponse(swift, response) {
    if (!swift) return;

    console.log(`[Interbank][${swift}][RESPONSE]`, response);
}

async function notifyTelegramInterbankSafe(payload) {
    try {
        const { notificarInterbancaria } = require('./telegramService');
        await notificarInterbancaria(payload);
    } catch (error) {
        console.error('[Telegram] error:', error.message);
    }
}

async function requestJson(url, payload, { idempotencyKey, extraHeaders = {}, logSwift = null, operation = 'REQUEST' } = {}) {
    if (typeof fetch !== 'function') {
        throw new InterbankError(500, 'Fetch no esta disponible. Use Node.js 18 o superior.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    const headers = {
        'Content-Type': 'application/json',
        'X-Bank-Name': LOCAL_BANK_NAME,
        'X-Bank-Swift': LOCAL_BANK_SWIFT
    };

    if (idempotencyKey) {
        headers['Idempotency-Key'] = idempotencyKey;
    }

    if (process.env.INTERBANK_API_KEY) {
        headers['X-API-Key'] = process.env.INTERBANK_API_KEY;
    }

    Object.assign(headers, extraHeaders);

    logInterbankRequest(logSwift, {
        operation,
        method: 'POST',
        url,
        headers,
        payload
    });

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        const text = await response.text();
        let data = {};

        if (text) {
            try {
                data = JSON.parse(text);
            } catch (error) {
                data = { raw: text };
            }
        }

        const result = {
            ok: response.ok,
            status: response.status,
            data
        };

        logInterbankResponse(logSwift, {
            operation,
            ok: result.ok,
            status: result.status,
            data: result.data
        });

        return result;
    } catch (error) {
        const result = {
            ok: false,
            status: 0,
            data: { error: error.name === 'AbortError' ? 'Tiempo de espera agotado' : error.message }
        };

        logInterbankResponse(logSwift, {
            operation,
            ok: result.ok,
            status: result.status,
            data: result.data
        });

        return result;
    } finally {
        clearTimeout(timeout);
    }
}

async function getCuentaLocal(cuentaOrigen, connection = db, { lock = false } = {}) {
    const value = typeof cuentaOrigen === 'string' ? cuentaOrigen.trim() : cuentaOrigen;
    const searchById = isNumericIdentifier(value);
    const conditions = ['c.numero_cuenta = $1'];
    const params = [String(value)];

    if (searchById) {
        conditions.push(`c.id_cuenta = $${params.length + 1}`);
        params.push(Number(value));
    }

    const [cuentas] = await connection.query(
        `SELECT c.id_cuenta,
                c.numero_cuenta,
                c.id_cliente,
                c.saldo,
                c.estado,
                cl.nombre,
                cl.apellido,
                cl.dpi
         FROM cuenta c
         JOIN cliente cl ON c.id_cliente = cl.id_cliente
         WHERE (${conditions.join(' OR ')})
           AND c.estado = 'ACTIVA'
         LIMIT 1 ${lock ? 'FOR UPDATE' : ''}`,
        params
    );

    return cuentas[0] || null;
}

async function getCuentaLocalPorNumeroCuenta(numeroCuenta, connection = db, { lock = false } = {}) {
    const cuentaNormalizada = normalizeAccountNumber(numeroCuenta);

    if (!cuentaNormalizada) {
        return null;
    }

    const [cuentas] = await connection.query(
        `SELECT c.id_cuenta,
                c.numero_cuenta,
                c.id_cliente,
                c.saldo,
                c.estado,
                cl.nombre,
                cl.apellido,
                cl.dpi
         FROM cuenta c
         LEFT JOIN cliente cl ON c.id_cliente = cl.id_cliente
         WHERE c.numero_cuenta = $1
           AND c.estado = 'ACTIVA'
         LIMIT 1 ${lock ? 'FOR UPDATE OF c' : ''}`,
        [cuentaNormalizada]
    );

    return cuentas[0] || null;
}

function normalizeCuentaValidationInput(input, bancoExterno) {
    const source = input && typeof input === 'object'
        ? input
        : { cuentaDestino: input };
    const rawSwiftDestino = getFirstValue(source, ['swiftDestino', 'SwiftDestino', 'swift_destino', 'swift', 'bancoDestinoSwift']);
    const rawCuenta = getFirstValue(source, [
        'cuentaDestino',
        'numeroCuenta',
        'numeroCuentaDestino',
        'CuentaDestino',
        'cuentaDestinoExterna',
        'cuenta_destino',
        'numero_cuenta',
        'numero_cuenta_destino',
        'cuenta'
    ]);
    const rawReferencia = getFirstValue(source, [
        'referencia',
        'referenciaInterna',
        'TransactionID',
        'transactionId',
        'TransactionId',
        'idempotencyKey',
        'numeroComprobante'
    ]);
    const referencia = rawReferencia || createReference('SWIFT-VAL');

    return {
        swiftOrigen: LOCAL_BANK_SWIFT,
        swiftDestino: normalizeSwift(rawSwiftDestino || bancoExterno.swift),
        cuentaOrigen: getFirstValue(source, ['cuentaOrigen', 'CuentaOrigen', 'numeroCuentaOrigen', 'cuenta_origen', 'numero_cuenta_origen', 'cuentaOrigenExterna']),
        cuentaDestino: rawCuenta,
        nombreOrigen: getFirstValue(source, ['nombreOrigen', 'NombreOrigen']) || LOCAL_BANK_NAME,
        monto: getFirstValue(source, ['monto', 'Monto']) || 1,
        descripcion: getFirstValue(source, ['descripcion', 'Descripcion', 'description']) || 'Validacion de cuenta interbancaria',
        referencia,
        idempotencyKey: String(getFirstValue(source, ['idempotencyKey', 'IdempotencyKey']) || referencia).trim()
    };
}

function shouldRetryValidationWithFallback(adapter, response) {
    if (typeof adapter.buildValidateAccountFallbackPayload !== 'function') {
        return false;
    }

    if (typeof adapter.shouldRetryValidateFallback === 'function') {
        return adapter.shouldRetryValidateFallback(response);
    }

    return false;
}

async function validarCuentaExterna(banco, input) {
    const bancoExterno = normalizeBancoExterno(banco);
    const adapter = getInterbankAdapter(bancoExterno.swift);
    const url = buildEndpointUrl(bancoExterno.baseUrl, bancoExterno.endpointValidacion);
    const standardInput = normalizeCuentaValidationInput(input, bancoExterno);
    let payload = adapter.buildValidateAccountPayload(standardInput);
    const extraHeaders = buildExternalAuthHeaders(bancoExterno);

    let response = await requestJson(url, payload, {
        idempotencyKey: standardInput.idempotencyKey,
        extraHeaders,
        logSwift: adapter.swift,
        operation: 'VALIDATE'
    });
    let parsed = adapter.parseValidateAccountResponse(response);

    if (!parsed.valid && shouldRetryValidationWithFallback(adapter, response)) {
        payload = adapter.buildValidateAccountFallbackPayload(standardInput);

        response = await requestJson(url, payload, {
            idempotencyKey: standardInput.idempotencyKey,
            extraHeaders,
            logSwift: adapter.swift,
            operation: 'VALIDATE_FALLBACK'
        });
        parsed = adapter.parseValidateAccountResponse(response);
    }

    return {
        valid: parsed.valid,
        status: parsed.status,
        data: parsed.data,
        requestPayload: payload,
        responsePayload: parsed.data
    };
}

async function enviarTransferenciaExterna(banco, transferencia) {
    const bancoExterno = normalizeBancoExterno(banco);
    const adapter = getInterbankAdapter(bancoExterno.swift);
    const url = buildEndpointUrl(bancoExterno.baseUrl, bancoExterno.endpointTransferencia);
    const standardInput = {
        swiftOrigen: transferencia.swiftOrigen || LOCAL_BANK_SWIFT,
        swiftDestino: bancoExterno.swift,
        cuentaOrigen: transferencia.cuentaOrigen,
        cuentaDestino: transferencia.cuentaDestino,
        nombreOrigen: transferencia.nombreOrigen,
        nombreDestino: transferencia.nombreDestino,
        monto: transferencia.monto,
        moneda: transferencia.moneda,
        referencia: transferencia.referencia || transferencia.referenciaInterna,
        idempotencyKey: transferencia.idempotencyKey,
        descripcion: transferencia.descripcion
    };
    const payload = validateStandardApiPayload(
        transferencia.standardPayload || adapter.buildOutgoingTransferPayload(standardInput)
    );
    const extraHeaders = buildExternalAuthHeaders(bancoExterno);
    const authEnabled = Boolean(extraHeaders.Authorization);

    console.log(`[Interbank][${adapter.swift}][TRANSFER] auth externo: ${authEnabled ? 'enabled' : 'disabled'}`);

    const response = await requestJson(url, payload, {
        idempotencyKey: transferencia.idempotencyKey,
        extraHeaders,
        logSwift: adapter.swift,
        operation: 'TRANSFER'
    });
    const parsed = adapter.parseOutgoingTransferResponse(response);

    return {
        ...parsed,
        requestPayload: payload,
        responsePayload: parsed.data
    };
}

async function buscarTransferenciaPorIdempotencia(tipo, idempotencyKey) {
    const [rows] = await db.query(
        `SELECT *
         FROM transferencias_interbancarias
         WHERE tipo = $1 AND idempotency_key = $2
         LIMIT 1`,
        [tipo, idempotencyKey]
    );

    return rows[0] || null;
}

async function insertarTransferenciaInicial(data) {
    try {
        const [result] = await db.query(
            `INSERT INTO transferencias_interbancarias
             (tipo, id_cuenta_origen, numero_cuenta_origen, id_cuenta_destino, numero_cuenta_destino,
              banco_origen_swift, banco_destino_swift, banco_destino_nombre, monto, moneda, descripcion,
              estado, referencia_interna, referencia_externa, idempotency_key, request_payload)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             RETURNING id_transferencia_interbancaria AS id`,
            [
                data.tipo,
                data.idCuentaOrigen || null,
                data.numeroCuentaOrigen || null,
                data.idCuentaDestino || null,
                data.numeroCuentaDestino || null,
                data.bancoOrigenSwift || null,
                data.bancoDestinoSwift || null,
                data.bancoDestinoNombre || null,
                data.monto,
                data.moneda,
                data.descripcion || null,
                data.estado || 'PENDIENTE',
                data.referenciaInterna,
                data.referenciaExterna || null,
                data.idempotencyKey,
                JSON.stringify(data.requestPayload || {})
            ]
        );

        return { id: result.insertId, duplicate: false, transferencia: null };
    } catch (error) {
        if (error.code === '23505') {
            const existente = await buscarTransferenciaPorIdempotencia(data.tipo, data.idempotencyKey);
            return {
                id: existente?.id_transferencia_interbancaria || null,
                duplicate: true,
                transferencia: existente
            };
        }

        throw error;
    }
}

async function actualizarTransferencia(id, fields) {
    const sets = [];
    const values = [];

    for (const [key, value] of Object.entries(fields)) {
        values.push(value);
        sets.push(`${key} = $${values.length}`);
    }

    if (sets.length === 0) return;

    values.push(id);
    await db.query(
        `UPDATE transferencias_interbancarias
         SET ${sets.join(', ')}
         WHERE id_transferencia_interbancaria = $${values.length}`,
        values
    );
}

async function validarApiKeyEntrante(apiKey, swiftOrigen = null) {
    if (!apiKey) return false;

    const apiKeyHash = hashApiKey(apiKey);
    const swiftNormalizado = normalizeSwift(swiftOrigen);

    const [rows] = await db.query(
        `SELECT k.id_api_key
         FROM api_keys_bancos k
         LEFT JOIN bancos_externos b ON k.id_banco_externo = b.id_banco_externo
         WHERE k.api_key_hash = $1
           AND k.activo = TRUE
           AND (k.id_banco_externo IS NULL OR b.swift = $2 OR $3 = '')
         LIMIT 1`,
        [apiKeyHash, swiftNormalizado, swiftNormalizado]
    );

    return rows.length > 0;
}

async function procesarTransferenciaSaliente(body, user) {
    const cuentaOrigen = getFirstValue(body, ['cuentaOrigen', 'numeroCuentaOrigen', 'cuenta_origen', 'CuentaOrigen', 'cuentaOrigenExterna']);
    const cuentaDestino = getFirstValue(body, ['cuentaDestino', 'numeroCuentaDestino', 'cuenta_destino', 'CuentaDestino', 'cuentaDestinoExterna', 'numeroCuenta']);
    const swiftDestino = normalizeSwift(getFirstValue(body, ['swiftDestino', 'SwiftDestino', 'bancoDestinoSwift', 'swift']));
    const transactionId = createStandardTransactionId();
    const idempotencyKey = transactionId;
    const moneda = 'GTQ';
    const descripcion = body.descripcion || body.referencia || 'Transferencia interbancaria SWIFT';
    const monto = parseAmount(body.monto);

    if (!cuentaOrigen || !cuentaDestino || !swiftDestino) {
        throw new InterbankError(400, 'cuentaOrigen, cuentaDestino y swiftDestino son requeridos');
    }

    if (swiftDestino === LOCAL_BANK_SWIFT) {
        throw new InterbankError(400, 'El SWIFT destino pertenece al banco local. Use la transferencia local.');
    }

    const transferenciaExistente = await buscarTransferenciaPorIdempotencia('SALIENTE', idempotencyKey);
    if (transferenciaExistente) {
        return { duplicate: true, transferencia: transferenciaExistente };
    }

    const bancoDestino = await obtenerBancoPorSwift(swiftDestino);
    if (!bancoDestino) {
        throw new InterbankError(404, 'Banco destino no encontrado o inactivo');
    }

    const idClienteUsuario = await getClienteIdFromUser(user);
    console.log('[Interbank][TRANSFER] buscando cuenta origen', {
        cuentaOrigen,
        id_usuario: user?.id_usuario || null,
        id_cliente: idClienteUsuario
    });

    if (!idClienteUsuario) {
        throw new InterbankError(403, 'El usuario JWT no tiene cliente asociado');
    }

    const cuentaLocal = await getCuentaLocal(cuentaOrigen);
    if (!cuentaLocal) {
        throw new InterbankError(404, 'Cuenta origen local no encontrada');
    }

    if (!canUseAccount(idClienteUsuario, cuentaLocal)) {
        throw new InterbankError(403, 'No tienes permiso para usar esta cuenta origen');
    }

    if (Number(cuentaLocal.saldo) < monto) {
        throw new InterbankError(400, 'Saldo insuficiente');
    }

    const numeroCuentaOrigen = cuentaLocal.numero_cuenta;
    const referenciaInterna = transactionId;
    const nombreOrigen = `${cuentaLocal.nombre || ''} ${cuentaLocal.apellido || ''}`.trim()
        || body.NombreOrigen
        || body.nombreOrigen
        || LOCAL_BANK_NAME;
    const standardPayload = validateStandardApiPayload({
        TransactionID: transactionId,
        cuentaOrigen: numeroCuentaOrigen,
        swiftOrigen: LOCAL_BANK_SWIFT,
        cuentaDestino,
        swiftDestino,
        NombreOrigen: nombreOrigen,
        monto,
        descripcion
    });
    const standardTransfer = {
        swiftOrigen: standardPayload.swiftOrigen,
        swiftDestino: standardPayload.swiftDestino,
        cuentaOrigen: standardPayload.cuentaOrigen,
        cuentaDestino: standardPayload.cuentaDestino,
        nombreOrigen: standardPayload.NombreOrigen,
        nombreDestino: body.nombreDestino || body.NombreDestino || null,
        monto: standardPayload.monto,
        moneda,
        referencia: transactionId,
        idempotencyKey,
        descripcion: standardPayload.descripcion,
        standardPayload
    };
    const transferenciaInicial = await insertarTransferenciaInicial({
        tipo: 'SALIENTE',
        idCuentaOrigen: cuentaLocal.id_cuenta,
        numeroCuentaOrigen,
        numeroCuentaDestino: cuentaDestino,
        bancoOrigenSwift: LOCAL_BANK_SWIFT,
        bancoDestinoSwift: bancoDestino.swift,
        bancoDestinoNombre: bancoDestino.nombre,
        monto,
        moneda,
        descripcion,
        estado: 'PENDIENTE',
        referenciaInterna,
        idempotencyKey,
        requestPayload: {
            original: body,
            interno: standardTransfer,
            estandar: standardPayload
        }
    });
    if (transferenciaInicial.duplicate) {
        return { duplicate: true, transferencia: transferenciaInicial.transferencia };
    }

    const transferenciaId = transferenciaInicial.id;

    const validacion = await validarCuentaExterna(bancoDestino, standardTransfer);
    if (!validacion.valid) {
        await actualizarTransferencia(transferenciaId, {
            estado: 'RECHAZADA',
            request_payload: createJsonLog({
                original: body,
                interno: standardTransfer,
                estandar: standardPayload,
                validacion: validacion.requestPayload
            }),
            response_payload: createJsonLog({
                validacion: validacion.responsePayload
            }),
            error_mensaje: 'La cuenta destino no fue validada por el banco externo'
        });

        throw new InterbankError(400, 'Cuenta destino rechazada por banco externo', validacion.data);
    }

    const respuestaExterna = await enviarTransferenciaExterna(bancoDestino, {
        ...standardTransfer,
        idempotencyKey,
        referenciaInterna,
        referencia: transactionId,
        cuentaOrigen: numeroCuentaOrigen,
        cuentaDestino,
        monto,
        moneda,
        descripcion
    });

    if (!respuestaExterna.success) {
        await actualizarTransferencia(transferenciaId, {
            estado: respuestaExterna.estado,
            referencia_externa: respuestaExterna.referenciaExterna,
            request_payload: createJsonLog({
                original: body,
                interno: standardTransfer,
                estandar: standardPayload,
                validacion: validacion.requestPayload,
                transferencia: respuestaExterna.requestPayload
            }),
            response_payload: createJsonLog({
                validacion: validacion.responsePayload,
                transferencia: respuestaExterna.responsePayload
            }),
            error_mensaje: 'El banco externo no confirmo la transferencia'
        });

        throw new InterbankError(502, 'El banco externo no confirmo la transferencia', respuestaExterna.data);
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const cuentaBloqueada = await getCuentaLocal(cuentaOrigen, connection, { lock: true });
        if (!cuentaBloqueada) {
            throw new InterbankError(404, 'Cuenta origen local no encontrada');
        }

        if (!canUseAccount(idClienteUsuario, cuentaBloqueada)) {
            throw new InterbankError(403, 'No tienes permiso para usar esta cuenta origen');
        }

        const saldoAnterior = Number(cuentaBloqueada.saldo);
        if (saldoAnterior < monto) {
            throw new InterbankError(400, 'Saldo insuficiente al confirmar la transferencia');
        }

        const saldoNuevo = Number((saldoAnterior - monto).toFixed(2));

        await connection.query(
            'UPDATE cuenta SET saldo = $1 WHERE id_cuenta = $2',
            [saldoNuevo, cuentaBloqueada.id_cuenta]
        );

        const [movimiento] = await connection.query(
            `INSERT INTO movimiento
             (id_cuenta, id_tipo_movimiento, monto, saldo_anterior, saldo_nuevo, descripcion, id_cajero, tipo_operacion)
             VALUES ($1, 3, $2, $3, $4, $5, $6, 'INTERBANCARIA_SWIFT')
             RETURNING id_movimiento AS id`,
            [
                cuentaBloqueada.id_cuenta,
                monto,
                saldoAnterior,
                saldoNuevo,
                descripcion,
                isPrivilegedRole(user) ? user.id_usuario : null
            ]
        );

        await connection.query(
            `UPDATE transferencias_interbancarias
             SET estado = $1,
                 referencia_externa = $2,
                 id_movimiento = $3,
                 request_payload = $4,
                 response_payload = $5
             WHERE id_transferencia_interbancaria = $6`,
            [
                respuestaExterna.estado,
                respuestaExterna.referenciaExterna,
                movimiento.insertId,
                createJsonLog({
                    original: body,
                    interno: standardTransfer,
                    estandar: standardPayload,
                    validacion: validacion.requestPayload,
                    transferencia: respuestaExterna.requestPayload
                }),
                createJsonLog({
                    validacion: validacion.responsePayload,
                    transferencia: respuestaExterna.responsePayload
                }),
                transferenciaId
            ]
        );

        await connection.commit();

        await notifyTelegramInterbankSafe({
            id_usuario: user?.id_usuario || null,
            username: user?.username || user?.nombre_usuario || null,
            tipo: 'INTERBANCARIA_SALIENTE',
            cuentaOrigen: numeroCuentaOrigen,
            cuentaDestino,
            monto,
            saldoNuevo,
            estado: respuestaExterna.estado,
            referenciaInterna,
            referenciaExterna: respuestaExterna.referenciaExterna,
            bancoOrigen: LOCAL_BANK_NAME,
            bancoDestino: bancoDestino.nombre || bancoDestino.swift,
            descripcion
        });

        return {
            duplicate: false,
            id: transferenciaId,
            estado: respuestaExterna.estado,
            referenciaInterna,
            transactionId,
            referenciaExterna: respuestaExterna.referenciaExterna,
            saldoNuevo
        };
    } catch (error) {
        await connection.rollback();

        await actualizarTransferencia(transferenciaId, {
            estado: 'ERROR',
            error_mensaje: error.message
        });

        throw error;
    } finally {
        connection.release();
    }
}

async function procesarTransferenciaEntrante(body, headers = {}) {
    const transferenciaNormalizada = normalizeStandardIncomingPayload(body);

    console.log('[Interbank][INCOMING] payload normalizado', {
        swiftOrigen: transferenciaNormalizada.swiftOrigen,
        swiftDestino: transferenciaNormalizada.swiftDestino,
        cuentaOrigen: transferenciaNormalizada.cuentaOrigen,
        cuentaDestino: transferenciaNormalizada.cuentaDestino,
        nombreOrigen: transferenciaNormalizada.nombreOrigen,
        monto: transferenciaNormalizada.monto,
        moneda: transferenciaNormalizada.moneda,
        referencia: transferenciaNormalizada.referencia,
        idempotencyKey: transferenciaNormalizada.idempotencyKey
    });

    const cuentaDestino = normalizeAccountNumber(transferenciaNormalizada.cuentaDestino);
    const cuentaOrigen = normalizeAccountNumber(transferenciaNormalizada.cuentaOrigen);
    const swiftOrigen = transferenciaNormalizada.swiftOrigen;
    const swiftDestino = transferenciaNormalizada.swiftDestino;
    const idempotencyKey = transferenciaNormalizada.idempotencyKey;
    const moneda = transferenciaNormalizada.moneda;
    const descripcion = transferenciaNormalizada.descripcion || 'Transferencia interbancaria recibida';
    const referenciaExterna = transferenciaNormalizada.referencia || null;

    console.log(`[Interbank][INCOMING] cuentaDestino normalizada: ${cuentaDestino || '(vacia)'}`);

    const monto = transferenciaNormalizada.monto;

    if (!swiftDestino) {
        throw new InterbankError(400, 'swiftDestino es requerido');
    }

    if (swiftDestino !== LOCAL_BANK_SWIFT) {
        throw new InterbankError(400, `swiftDestino debe ser ${LOCAL_BANK_SWIFT}`);
    }

    if (!cuentaDestino || !swiftOrigen) {
        throw new InterbankError(400, 'cuentaDestino y swiftOrigen son requeridos');
    }

    if (!idempotencyKey) {
        throw new InterbankError(400, 'idempotencyKey o referenciaExterna es requerido');
    }

    const existente = await buscarTransferenciaPorIdempotencia('ENTRANTE', idempotencyKey);
    if (existente) {
        return { duplicate: true, transferencia: existente };
    }

    const referenciaInterna = idempotencyKey;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const cuentaLocal = await getCuentaLocalPorNumeroCuenta(cuentaDestino, connection, { lock: true });
        console.log(`[Interbank][INCOMING] cuenta local ${cuentaLocal ? 'encontrada' : 'no encontrada'}`, {
            cuentaDestino,
            idCuenta: cuentaLocal?.id_cuenta || null
        });

        if (!cuentaLocal) {
            await connection.query(
                `INSERT INTO transferencias_interbancarias
                 (tipo, numero_cuenta_origen, numero_cuenta_destino, banco_origen_swift, banco_destino_swift,
                  monto, moneda, descripcion, estado, referencia_interna, referencia_externa, idempotency_key,
                  request_payload, error_mensaje)
                 VALUES ('ENTRANTE', $1, $2, $3, $4, $5, $6, $7, 'RECHAZADA', $8, $9, $10, $11, $12)`,
                [
                    cuentaOrigen,
                    cuentaDestino,
                    swiftOrigen,
                    LOCAL_BANK_SWIFT,
                    monto,
                    moneda,
                    descripcion,
                    referenciaInterna,
                    referenciaExterna,
                    idempotencyKey,
                    createJsonLog({
                        original: body,
                        normalizado: transferenciaNormalizada
                    }),
                    'Cuenta destino local no encontrada'
                ]
            );

            await connection.commit();
            return {
                duplicate: false,
                rejected: true,
                estado: 'RECHAZADA',
                referenciaInterna,
                error: 'Cuenta destino local no encontrada'
            };
        }

        const usuarioDestino = await getUsuarioPorClienteId(cuentaLocal.id_cliente, connection);
        const saldoAnterior = Number(cuentaLocal.saldo);
        const saldoNuevo = Number((saldoAnterior + monto).toFixed(2));

        await connection.query(
            'UPDATE cuenta SET saldo = $1 WHERE id_cuenta = $2',
            [saldoNuevo, cuentaLocal.id_cuenta]
        );

        const [movimiento] = await connection.query(
            `INSERT INTO movimiento
             (id_cuenta, id_tipo_movimiento, monto, saldo_anterior, saldo_nuevo, descripcion, tipo_operacion)
             VALUES ($1, 4, $2, $3, $4, $5, 'INTERBANCARIA_SWIFT')
             RETURNING id_movimiento AS id`,
            [cuentaLocal.id_cuenta, monto, saldoAnterior, saldoNuevo, descripcion]
        );

        const [transferenciaInsertada] = await connection.query(
            `INSERT INTO transferencias_interbancarias
             (tipo, id_cuenta_destino, numero_cuenta_origen, numero_cuenta_destino, banco_origen_swift,
              banco_destino_swift, monto, moneda, descripcion, estado, referencia_interna, referencia_externa,
              idempotency_key, id_movimiento, request_payload, response_payload)
             VALUES ('ENTRANTE', $1, $2, $3, $4, $5, $6, $7, $8, 'CONFIRMADA', $9, $10, $11, $12, $13, $14)
             RETURNING id_transferencia_interbancaria AS id`,
            [
                cuentaLocal.id_cuenta,
                cuentaOrigen,
                cuentaDestino,
                swiftOrigen,
                LOCAL_BANK_SWIFT,
                monto,
                moneda,
                descripcion,
                referenciaInterna,
                referenciaExterna,
                idempotencyKey,
                movimiento.insertId,
                createJsonLog({
                    original: body,
                    normalizado: transferenciaNormalizada
                }),
                createJsonLog({
                    estado: 'CONFIRMADA',
                    referenciaInterna,
                    saldoNuevo
                })
            ]
        );

        await connection.commit();

        if (usuarioDestino) {
            await notifyTelegramInterbankSafe({
                id_usuario: usuarioDestino.id_usuario,
                username: usuarioDestino.nombre_usuario,
                tipo: 'INTERBANCARIA_ENTRANTE',
                cuentaOrigen,
                cuentaDestino,
                monto,
                saldoNuevo,
                estado: 'CONFIRMADA',
                referenciaInterna,
                referenciaExterna,
                bancoOrigen: swiftOrigen,
                bancoDestino: LOCAL_BANK_NAME,
                descripcion
            });
        }

        return {
            duplicate: false,
            id: transferenciaInsertada.insertId,
            estado: 'CONFIRMADA',
            referenciaInterna,
            mensaje: 'Transferencia recibida correctamente',
            saldoNuevo
        };
    } catch (error) {
        await connection.rollback();

        if (error.code === '23505') {
            const duplicada = await buscarTransferenciaPorIdempotencia('ENTRANTE', idempotencyKey);
            return { duplicate: true, transferencia: duplicada };
        }

        throw error;
    } finally {
        connection.release();
    }
}

async function listarHistorialInterbancario(user, { limit = 100 } = {}) {
    const queryLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const params = [];
    let where = '';

    if (!isPrivilegedRole(user)) {
        const idCliente = await getClienteIdFromUser(user);

        if (!idCliente) {
            return [];
        }

        params.push(idCliente);
        where = `
            WHERE (
                ti.id_cuenta_origen IN (SELECT id_cuenta FROM cuenta WHERE id_cliente = $1)
                OR ti.id_cuenta_destino IN (SELECT id_cuenta FROM cuenta WHERE id_cliente = $1)
                OR ti.numero_cuenta_origen IN (SELECT numero_cuenta FROM cuenta WHERE id_cliente = $1)
                OR ti.numero_cuenta_destino IN (SELECT numero_cuenta FROM cuenta WHERE id_cliente = $1)
            )`;
    }

    params.push(queryLimit);
    const limitParam = `$${params.length}`;

    const [rows] = await db.query(
        `SELECT ti.id_transferencia_interbancaria,
                ti.tipo,
                ti.numero_cuenta_origen,
                ti.numero_cuenta_destino,
                ti.banco_origen_swift,
                ti.banco_destino_swift,
                ti.banco_destino_nombre,
                ti.monto,
                ti.moneda,
                ti.estado,
                ti.referencia_interna,
                ti.referencia_externa,
                ti.error_mensaje,
                ti.fecha_creacion
         FROM transferencias_interbancarias ti
         ${where}
         ORDER BY ti.fecha_creacion DESC
         LIMIT ${limitParam}`,
        params
    );

    return rows.map((row) => {
        const bancoLocal = `${LOCAL_BANK_NAME} (${LOCAL_BANK_SWIFT})`;
        const bancoDestinoExterno = row.banco_destino_nombre
            ? `${row.banco_destino_nombre} (${row.banco_destino_swift || '-'})`
            : (row.banco_destino_swift || '-');

        return {
            id: row.id_transferencia_interbancaria,
            fecha: row.fecha_creacion,
            tipo: row.tipo,
            bancoOrigen: row.tipo === 'ENTRANTE'
                ? (row.banco_origen_swift || '-')
                : bancoLocal,
            bancoDestino: row.tipo === 'SALIENTE'
                ? bancoDestinoExterno
                : bancoLocal,
            cuentaOrigen: row.numero_cuenta_origen || '-',
            cuentaDestino: row.numero_cuenta_destino || '-',
            monto: row.monto,
            moneda: row.moneda,
            estado: row.estado,
            referenciaInterna: row.referencia_interna,
            referenciaExterna: row.referencia_externa,
            errorMensaje: row.error_mensaje
        };
    });
}

async function obtenerComprobanteInterbancario(user, referencia) {
    const referenciaNormalizada = String(referencia || '').trim();

    if (!referenciaNormalizada) {
        throw new InterbankError(400, 'Referencia requerida');
    }

    const [rows] = await db.query(
        `SELECT ti.id_transferencia_interbancaria,
                ti.tipo,
                ti.numero_cuenta_origen,
                ti.numero_cuenta_destino,
                ti.banco_origen_swift,
                ti.banco_destino_swift,
                ti.banco_destino_nombre,
                ti.monto,
                ti.moneda,
                ti.descripcion,
                ti.estado,
                ti.referencia_interna,
                ti.referencia_externa,
                ti.fecha_creacion,
                co.id_cliente AS id_cliente_origen,
                cd.id_cliente AS id_cliente_destino
         FROM transferencias_interbancarias ti
         LEFT JOIN cuenta co
                ON co.id_cuenta = ti.id_cuenta_origen
                OR co.numero_cuenta = ti.numero_cuenta_origen
         LEFT JOIN cuenta cd
                ON cd.id_cuenta = ti.id_cuenta_destino
                OR cd.numero_cuenta = ti.numero_cuenta_destino
         WHERE ti.referencia_interna = $1
            OR ti.referencia_externa = $1
         LIMIT 1`,
        [referenciaNormalizada]
    );

    const row = rows[0];

    if (!row) {
        throw new InterbankError(404, 'Comprobante interbancario no encontrado');
    }

    if (row.estado !== 'CONFIRMADA') {
        throw new InterbankError(400, 'Solo se puede generar comprobante de transferencias CONFIRMADAS');
    }

    if (!isPrivilegedRole(user)) {
        const idCliente = await getClienteIdFromUser(user);
        const isOwner = idCliente
            && (
                Number(row.id_cliente_origen) === Number(idCliente)
                || Number(row.id_cliente_destino) === Number(idCliente)
            );

        if (!isOwner) {
            throw new InterbankError(403, 'No tienes permiso para descargar este comprobante');
        }
    }

    const bancoLocal = `${LOCAL_BANK_NAME} (${LOCAL_BANK_SWIFT})`;
    const bancoDestinoExterno = row.banco_destino_nombre
        ? `${row.banco_destino_nombre} (${row.banco_destino_swift || '-'})`
        : (row.banco_destino_swift || '-');

    return {
        bancoNombre: LOCAL_BANK_NAME,
        swiftLocal: LOCAL_BANK_SWIFT,
        tipo: row.tipo,
        referenciaInterna: row.referencia_interna,
        referenciaExterna: row.referencia_externa,
        fecha: row.fecha_creacion,
        cuentaOrigen: row.numero_cuenta_origen || '-',
        cuentaDestino: row.numero_cuenta_destino || '-',
        bancoOrigen: row.tipo === 'ENTRANTE'
            ? (row.banco_origen_swift || '-')
            : bancoLocal,
        bancoDestino: row.tipo === 'SALIENTE'
            ? bancoDestinoExterno
            : bancoLocal,
        monto: row.monto,
        moneda: row.moneda,
        descripcion: row.descripcion || '-',
        estado: row.estado
    };
}

module.exports = {
    InterbankError,
    LOCAL_BANK_NAME,
    LOCAL_BANK_SWIFT,
    getCuentaLocal,
    listarHistorialInterbancario,
    obtenerComprobanteInterbancario,
    parseAmount,
    procesarTransferenciaEntrante,
    procesarTransferenciaSaliente,
    validarApiKeyEntrante,
    validarCuentaExterna
};

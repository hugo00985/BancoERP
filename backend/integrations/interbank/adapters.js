function normalizeSwift(swift) {
    return String(swift || '').trim().toUpperCase();
}

function firstValue(source, keys) {
    const valueSource = source || {};

    for (const key of keys) {
        const value = valueSource[key];

        if (value !== undefined && value !== null && value !== '') {
            return value;
        }
    }

    return null;
}

function normalizeAccountValue(value) {
    if (value === undefined || value === null) {
        return null;
    }

    const normalized = String(value).trim();
    return normalized || null;
}

function inputValue(input, keys, fallback = null) {
    const value = firstValue(input, keys);
    return value === null ? fallback : value;
}

function buildTransactionId(input) {
    return inputValue(input, [
        'referencia',
        'referenciaInterna',
        'TransactionID',
        'TransactionId',
        'transactionId',
        'idempotencyKey',
        'IdempotencyKey'
    ]);
}

function buildNovaBankPayload(input, { validation = false } = {}) {
    const monto = inputValue(input, ['monto', 'Monto'], validation ? 0 : 0);
    const transactionId = buildTransactionId(input);

    return {
        TransactionID: transactionId,
        CuentaOrigen: normalizeAccountValue(inputValue(input, ['cuentaOrigen', 'CuentaOrigen', 'cuenta_origen'], 'BANCOGT')),
        CuentaDestino: normalizeAccountValue(inputValue(input, ['cuentaDestino', 'CuentaDestino', 'cuentaDestinoExterna', 'cuenta_destino'])),
        SwiftOrigen: normalizeSwift(inputValue(input, ['swiftOrigen', 'SwiftOrigen', 'swift_origen'])),
        SwiftDestino: normalizeSwift(inputValue(input, ['swiftDestino', 'SwiftDestino', 'swift_destino'], 'GTB666')) || 'GTB666',
        Monto: String(monto),
        Tipo: inputValue(input, ['tipo', 'Tipo'], 'ACH'),
        Estado: inputValue(input, ['estado', 'Estado'], 'APROBADO'),
        Descripcion: inputValue(input, ['descripcion', 'Descripcion'], validation ? 'Validacion de cuenta interbancaria' : 'Transferencia interbancaria'),
        NombreOrigen: inputValue(input, ['nombreOrigen', 'NombreOrigen'], 'Banco Industrial')
    };
}

function normalizeEstado(value, fallback = 'CONFIRMADA') {
    const estado = String(value || '').trim().toUpperCase();

    if (estado.includes('PEND')) return 'PENDIENTE';
    if (
        estado.includes('APROB')
        || estado.includes('CONF')
        || estado.includes('COMPLET')
        || estado === 'OK'
        || estado === 'SUCCESS'
        || estado === 'EXITOSO'
    ) return 'CONFIRMADA';
    if (estado.includes('RECH') || estado.includes('FAIL') || estado.includes('DEN')) return 'RECHAZADA';
    if (estado.includes('ERROR')) return 'ERROR';

    return fallback;
}

function getResponseData(response) {
    return response?.data || response || {};
}

function getEstadoFromData(data) {
    if (typeof data === 'string') {
        return data;
    }

    return firstValue(data, [
        'estado',
        'Estado',
        'status',
        'Status',
        'resultado',
        'Resultado',
        'mensaje',
        'message',
        'raw'
    ]);
}

function getExternalReference(data) {
    if (typeof data === 'string') {
        return null;
    }

    return firstValue(data, [
        'numeroComprobante',
        'NumeroComprobante',
        'transactionId',
        'TransactionId',
        'TransactionID',
        'referenciaExterna',
        'referencia',
        'id_transferencia',
        'idTransferencia',
        'id'
    ]);
}

function hasApproval(data) {
    if (typeof data === 'string') {
        return normalizeEstado(data, '') === 'CONFIRMADA';
    }

    return data.success === true
        || data.valida === true
        || data.valid === true
        || data.existe === true
        || normalizeEstado(getEstadoFromData(data), '') === 'CONFIRMADA';
}

function hasExplicitFailure(data) {
    const estado = normalizeEstado(getEstadoFromData(data), '');

    return data.success === false
        || data.valida === false
        || data.valid === false
        || data.existe === false
        || estado === 'RECHAZADA'
        || estado === 'ERROR';
}

function hasRequiredFieldError(response) {
    const data = getResponseData(response);
    const text = JSON.stringify(data).toLowerCase();

    return [400, 422].includes(Number(response?.status))
        && (
            text.includes('cuentadestino')
            || text.includes('transactionid')
            || text.includes('requerid')
            || text.includes('falt')
            || text.includes('required')
        );
}

function parseValidateAccountResponse(response) {
    const data = getResponseData(response);
    const valid = Boolean(response?.ok) && !hasExplicitFailure(data);

    return {
        valid,
        status: response?.status || 0,
        data
    };
}

function parseOutgoingTransferResponse(response) {
    const data = getResponseData(response);
    const rejected = hasExplicitFailure(data);
    const estadoOriginal = getEstadoFromData(data);
    const estado = normalizeEstado(estadoOriginal);
    const referenciaExterna = getExternalReference(data);
    const success = Boolean(response?.ok)
        && !rejected
        && (hasApproval(data) || (!estadoOriginal && Boolean(referenciaExterna)));

    return {
        success,
        estado: success ? estado : normalizeEstado(estadoOriginal, 'RECHAZADA'),
        status: response?.status || 0,
        referenciaExterna,
        data
    };
}

const DEFAULT = {
    swift: 'DEFAULT',
    buildValidateAccountPayload(input) {
        return {
            swiftDestino: input.swiftDestino,
            cuentaDestino: input.cuentaDestino,
            numeroCuenta: input.cuentaDestino,
            referencia: input.referencia
        };
    },
    parseValidateAccountResponse,
    buildOutgoingTransferPayload(input) {
        return {
            swiftOrigen: input.swiftOrigen,
            swiftDestino: input.swiftDestino,
            cuentaOrigen: input.cuentaOrigen,
            cuentaDestino: input.cuentaDestino,
            nombreOrigen: input.nombreOrigen,
            monto: input.monto,
            moneda: input.moneda,
            referencia: input.referencia,
            idempotencyKey: input.idempotencyKey,
            descripcion: input.descripcion
        };
    },
    parseOutgoingTransferResponse
};

const GTTBXXXX = {
    swift: 'GTTBXXXX',
    buildValidateAccountPayload(input) {
        return {
            TransactionID: buildTransactionId(input),
            cuentaOrigen: normalizeAccountValue(inputValue(input, ['cuentaOrigen', 'CuentaOrigen', 'cuenta_origen'], '')),
            swiftOrigen: normalizeSwift(inputValue(input, ['swiftOrigen', 'SwiftOrigen', 'swift_origen'])),
            cuentaDestino: normalizeAccountValue(inputValue(input, ['cuentaDestino', 'CuentaDestino', 'cuentaDestinoExterna', 'cuenta_destino'])),
            swiftDestino: 'GTTBXXXX',
            NombreOrigen: inputValue(input, ['nombreOrigen', 'NombreOrigen'], ''),
            monto: inputValue(input, ['monto', 'Monto'], 0),
            descripcion: inputValue(input, ['descripcion', 'Descripcion'], 'Validacion de cuenta interbancaria')
        };
    },
    parseValidateAccountResponse,
    buildOutgoingTransferPayload(input) {
        return {
            TransactionID: buildTransactionId(input),
            cuentaOrigen: normalizeAccountValue(inputValue(input, ['cuentaOrigen', 'CuentaOrigen', 'cuenta_origen'])),
            swiftOrigen: normalizeSwift(inputValue(input, ['swiftOrigen', 'SwiftOrigen', 'swift_origen'])),
            cuentaDestino: normalizeAccountValue(inputValue(input, ['cuentaDestino', 'CuentaDestino', 'cuentaDestinoExterna', 'cuenta_destino'])),
            swiftDestino: 'GTTBXXXX',
            NombreOrigen: inputValue(input, ['nombreOrigen', 'NombreOrigen']),
            monto: inputValue(input, ['monto', 'Monto']),
            descripcion: inputValue(input, ['descripcion', 'Descripcion'], 'Transferencia interbancaria')
        };
    },
    parseOutgoingTransferResponse
};

const GTB666 = {
    swift: 'GTB666',
    buildValidateAccountPayload(input) {
        return buildNovaBankPayload(input, { validation: true });
    },
    buildValidateAccountFallbackPayload(input) {
        return {
            CuentaDestino: normalizeAccountValue(inputValue(input, ['cuentaDestino', 'CuentaDestino', 'cuentaDestinoExterna', 'cuenta_destino'])),
            TransactionId: buildTransactionId(input)
        };
    },
    shouldRetryValidateFallback: hasRequiredFieldError,
    parseValidateAccountResponse,
    buildOutgoingTransferPayload(input) {
        return buildNovaBankPayload(input);
    },
    parseOutgoingTransferResponse
};

const GTBC6968 = {
    ...DEFAULT,
    swift: 'GTBC6968',
    buildValidateAccountPayload(input) {
        return {
            cuentaDestino: normalizeAccountValue(inputValue(input, ['cuentaDestino', 'CuentaDestino', 'cuentaDestinoExterna', 'cuenta_destino'])),
            swiftDestino: 'GTBC6968'
        };
    },
    buildOutgoingTransferPayload(input) {
        return {
            cuenta_origen: normalizeAccountValue(inputValue(input, ['cuentaOrigen', 'CuentaOrigen', 'cuenta_origen'])),
            cuenta_destino: normalizeAccountValue(inputValue(input, ['cuentaDestino', 'CuentaDestino', 'cuentaDestinoExterna', 'cuenta_destino'])),
            swift_destino: 'GTBC6968',
            monto: inputValue(input, ['monto', 'Monto']),
            descripcion: inputValue(input, ['descripcion', 'Descripcion'], 'Transferencia interbancaria')
        };
    }
};

const RWL001 = {
    ...GTBC6968,
    swift: 'RWL001'
};

const adaptersBySwift = {
    GTTBXXXX,
    GTB666,
    GTBC6968,
    RWL001,
    DEFAULT
};

function getInterbankAdapter(swift) {
    return adaptersBySwift[normalizeSwift(swift)] || DEFAULT;
}

function normalizeIncomingTransferPayload(body = {}, headers = {}, defaults = {}) {
    const headerIdempotency = firstValue(headers, ['idempotency-key', 'Idempotency-Key']);
    const headerSwiftOrigen = firstValue(headers, ['x-bank-swift', 'X-Bank-Swift']);
    const referencia = firstValue(body, [
        'referencia',
        'referenciaExterna',
        'transactionId',
        'TransactionId',
        'TransactionID',
        'numeroComprobante',
        'idempotencyKey',
        'IdempotencyKey'
    ]);

    const swiftOrigen = normalizeSwift(firstValue(body, [
        'swiftOrigen',
        'SwiftOrigen',
        'swift_origen',
        'bancoOrigenSwift',
        'bancoOrigen',
        'BancoOrigen',
        'swift'
    ]) || headerSwiftOrigen || defaults.swiftOrigen || 'EXTERNO');

    const swiftDestino = normalizeSwift(firstValue(body, [
        'swiftDestino',
        'SwiftDestino',
        'swift_destino',
        'bancoDestinoSwift'
    ]));
    const cuentaDestino = normalizeAccountValue(firstValue(body, [
        'CuentaDestino',
        'cuentaDestino',
        'cuentaDestinoExterna',
        'numeroCuentaDestino',
        'cuenta_destino',
        'numero_cuenta',
        'numero_cuenta_destino',
        'NumeroCuentaDestino'
    ]));

    return {
        swiftOrigen,
        swiftDestino: swiftDestino || normalizeSwift(defaults.swiftDestino),
        cuentaOrigen: normalizeAccountValue(firstValue(body, [
            'cuentaOrigen',
            'numeroCuentaOrigen',
            'cuenta_origen',
            'cuentaOrigenExterna',
            'CuentaOrigen'
        ])),
        cuentaDestino,
        nombreOrigen: firstValue(body, ['nombreOrigen', 'NombreOrigen']),
        nombreDestino: firstValue(body, ['nombreDestino', 'NombreDestino']),
        monto: firstValue(body, ['monto', 'Monto']),
        moneda: String(firstValue(body, ['moneda', 'Moneda']) || defaults.moneda || 'GTQ').trim().toUpperCase(),
        descripcion: firstValue(body, ['descripcion', 'Descripcion']),
        referencia,
        idempotencyKey: String(headerIdempotency || firstValue(body, [
            'idempotencyKey',
            'IdempotencyKey',
            'transactionId',
            'TransactionId',
            'TransactionID',
            'numeroComprobante',
            'referencia',
            'referenciaExterna'
        ]) || '').trim(),
        raw: body
    };
}

module.exports = {
    DEFAULT,
    GTTBXXXX,
    GTB666,
    GTBC6968,
    RWL001,
    getInterbankAdapter,
    normalizeIncomingTransferPayload,
    normalizeSwift
};

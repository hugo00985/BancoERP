const soap = require('soap');
const db = require('../config/db');
const {
    LOCAL_BANK_NAME,
    LOCAL_BANK_SWIFT,
    procesarTransferenciaEntrante
} = require('./interbancariaService');
const { registrarEventoAuditoria } = require('./auditoriaService');

const SOAP_PATH = '/api/ws/banco';
const SOAP_NAMESPACE = 'http://bancogt.com/ws/banco';

function cleanBaseUrl(value) {
    return String(value || '').trim().replace(/\/+$/, '');
}

function getPublicBaseUrl() {
    const explicit = cleanBaseUrl(
        process.env.PUBLIC_BACKEND_URL
        || process.env.BACKEND_PUBLIC_URL
        || process.env.API_PUBLIC_URL
    );

    if (explicit) {
        return explicit;
    }

    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
        return `https://${String(process.env.RAILWAY_PUBLIC_DOMAIN).trim()}`;
    }

    return `http://localhost:${process.env.PORT || 3000}`;
}

function getSoapServiceUrl() {
    return `${getPublicBaseUrl()}${SOAP_PATH}`;
}

function isWsdlRequest(req) {
    return Object.prototype.hasOwnProperty.call(req.query || {}, 'wsdl')
        || /\?wsdl(?:$|[=&])/i.test(req.originalUrl || req.url || '');
}

function serveWsdl(wsdl) {
    return (req, res, next) => {
        if (!isWsdlRequest(req)) {
            return next();
        }

        return res.status(200).type('application/xml').send(wsdl);
    };
}

function escapeXml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function firstValue(source, keys, fallback = '') {
    const valueSource = source || {};

    for (const key of keys) {
        if (valueSource[key] !== undefined && valueSource[key] !== null && valueSource[key] !== '') {
            return valueSource[key];
        }
    }

    return fallback;
}

function logSoapOperation(operacion, metadata = {}) {
    console.log('[SOAP] operacion ejecutada', {
        operacion,
        ...metadata
    });
}

function toApprovedRejected(estado) {
    return String(estado || '').trim().toUpperCase() === 'CONFIRMADA'
        ? 'APROBADO'
        : 'RECHAZADO';
}

function normalizeSoapArgs(args = {}) {
    return args.parameters || args.request || args;
}

async function consultarBanco() {
    const endpointInterbancario = `${getPublicBaseUrl()}/api/interbancaria/entrante`;

    logSoapOperation('consultarBanco', {
        swift: LOCAL_BANK_SWIFT
    });

    return {
        nombreBanco: LOCAL_BANK_NAME,
        swift: LOCAL_BANK_SWIFT,
        endpointInterbancario
    };
}

async function validarCuenta(args) {
    const source = normalizeSoapArgs(args);
    const numeroCuenta = String(firstValue(source, ['numeroCuenta', 'numero_cuenta'])).trim();

    logSoapOperation('validarCuenta', {
        numeroCuenta
    });

    if (!numeroCuenta) {
        return {
            existe: false,
            numeroCuenta: '',
            estado: 'NUMERO_CUENTA_REQUERIDO'
        };
    }

    const [cuentas] = await db.query(
        `SELECT numero_cuenta, estado
         FROM cuenta
         WHERE numero_cuenta = $1
         LIMIT 1`,
        [numeroCuenta]
    );
    const cuenta = cuentas[0];

    return {
        existe: Boolean(cuenta),
        numeroCuenta,
        estado: cuenta?.estado || 'NO_EXISTE'
    };
}

async function consultarSaldo(args) {
    const source = normalizeSoapArgs(args);
    const numeroCuenta = String(firstValue(source, ['numeroCuenta', 'numero_cuenta'])).trim();

    logSoapOperation('consultarSaldo', {
        numeroCuenta
    });

    if (!numeroCuenta) {
        return {
            numeroCuenta: '',
            saldo: 0,
            moneda: 'GTQ'
        };
    }

    const [cuentas] = await db.query(
        `SELECT c.numero_cuenta, c.saldo, m.codigo AS moneda
         FROM cuenta c
         JOIN moneda m ON c.id_moneda = m.id_moneda
         WHERE c.numero_cuenta = $1
           AND c.estado = 'ACTIVA'
         LIMIT 1`,
        [numeroCuenta]
    );
    const cuenta = cuentas[0];

    return {
        numeroCuenta,
        saldo: cuenta ? Number(cuenta.saldo) : 0,
        moneda: cuenta?.moneda || 'GTQ'
    };
}

function buildIncomingPayload(args) {
    const source = normalizeSoapArgs(args);

    return {
        TransactionID: String(firstValue(source, ['TransactionID', 'transactionId', 'TransactionId'])).trim(),
        cuentaOrigen: String(firstValue(source, ['cuentaOrigen', 'CuentaOrigen'])).trim(),
        swiftOrigen: String(firstValue(source, ['swiftOrigen', 'SwiftOrigen'])).trim(),
        cuentaDestino: String(firstValue(source, ['cuentaDestino', 'CuentaDestino'])).trim(),
        swiftDestino: String(firstValue(source, ['swiftDestino', 'SwiftDestino'])).trim(),
        NombreOrigen: String(firstValue(source, ['NombreOrigen', 'nombreOrigen'])).trim(),
        monto: Number(firstValue(source, ['monto', 'Monto'], 0)),
        descripcion: String(firstValue(source, ['descripcion', 'Descripcion'], 'Transferencia interbancaria SOAP')).trim()
    };
}

async function recibirTransferenciaInterbancaria(args, callback, headers, req) {
    const payload = buildIncomingPayload(args);

    logSoapOperation('recibirTransferenciaInterbancaria', {
        TransactionID: payload.TransactionID,
        swiftOrigen: payload.swiftOrigen,
        swiftDestino: payload.swiftDestino,
        cuentaDestino: payload.cuentaDestino,
        monto: payload.monto
    });

    try {
        const result = await procesarTransferenciaEntrante(payload, req?.headers || {});
        const estado = result.duplicate
            ? result.transferencia?.estado
            : (result.rejected ? result.estado : result.estado);
        const resultado = toApprovedRejected(estado);

        await registrarEventoAuditoria({
            req,
            accion: 'SOAP_TRANSFERENCIA_INTERBANCARIA_ENTRANTE',
            modulo: 'SOAP',
            descripcion: 'Transferencia interbancaria entrante recibida por SOAP',
            estado: resultado === 'APROBADO' ? 'OK' : 'RECHAZADA',
            metadata: {
                payload,
                resultado,
                result
            }
        });

        return { resultado };
    } catch (error) {
        console.error('[SOAP] error:', error.message);

        await registrarEventoAuditoria({
            req,
            accion: 'SOAP_TRANSFERENCIA_INTERBANCARIA_ENTRANTE',
            modulo: 'SOAP',
            descripcion: 'Error procesando transferencia interbancaria SOAP',
            estado: error.statusCode && error.statusCode < 500 ? 'FALLIDO' : 'ERROR',
            metadata: {
                payload,
                error: error.message,
                details: error.details || null
            }
        });

        return { resultado: 'RECHAZADO' };
    }
}

function buildWsdl(serviceUrl) {
    const escapedServiceUrl = escapeXml(serviceUrl);

    return `<?xml version="1.0" encoding="UTF-8"?>
<definitions name="BancoWebService"
    targetNamespace="${SOAP_NAMESPACE}"
    xmlns="http://schemas.xmlsoap.org/wsdl/"
    xmlns:tns="${SOAP_NAMESPACE}"
    xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
    xmlns:xsd="http://www.w3.org/2001/XMLSchema">
    <types>
        <xsd:schema targetNamespace="${SOAP_NAMESPACE}" elementFormDefault="qualified">
            <xsd:element name="consultarBancoRequest">
                <xsd:complexType>
                    <xsd:sequence />
                </xsd:complexType>
            </xsd:element>
            <xsd:element name="consultarBancoResponse">
                <xsd:complexType>
                    <xsd:sequence>
                        <xsd:element name="nombreBanco" type="xsd:string" />
                        <xsd:element name="swift" type="xsd:string" />
                        <xsd:element name="endpointInterbancario" type="xsd:string" />
                    </xsd:sequence>
                </xsd:complexType>
            </xsd:element>

            <xsd:element name="validarCuentaRequest">
                <xsd:complexType>
                    <xsd:sequence>
                        <xsd:element name="numeroCuenta" type="xsd:string" />
                    </xsd:sequence>
                </xsd:complexType>
            </xsd:element>
            <xsd:element name="validarCuentaResponse">
                <xsd:complexType>
                    <xsd:sequence>
                        <xsd:element name="existe" type="xsd:boolean" />
                        <xsd:element name="numeroCuenta" type="xsd:string" />
                        <xsd:element name="estado" type="xsd:string" />
                    </xsd:sequence>
                </xsd:complexType>
            </xsd:element>

            <xsd:element name="consultarSaldoRequest">
                <xsd:complexType>
                    <xsd:sequence>
                        <xsd:element name="numeroCuenta" type="xsd:string" />
                    </xsd:sequence>
                </xsd:complexType>
            </xsd:element>
            <xsd:element name="consultarSaldoResponse">
                <xsd:complexType>
                    <xsd:sequence>
                        <xsd:element name="numeroCuenta" type="xsd:string" />
                        <xsd:element name="saldo" type="xsd:decimal" />
                        <xsd:element name="moneda" type="xsd:string" />
                    </xsd:sequence>
                </xsd:complexType>
            </xsd:element>

            <xsd:element name="recibirTransferenciaInterbancariaRequest">
                <xsd:complexType>
                    <xsd:sequence>
                        <xsd:element name="TransactionID" type="xsd:string" />
                        <xsd:element name="cuentaOrigen" type="xsd:string" />
                        <xsd:element name="swiftOrigen" type="xsd:string" />
                        <xsd:element name="cuentaDestino" type="xsd:string" />
                        <xsd:element name="swiftDestino" type="xsd:string" />
                        <xsd:element name="NombreOrigen" type="xsd:string" />
                        <xsd:element name="monto" type="xsd:decimal" />
                        <xsd:element name="descripcion" type="xsd:string" minOccurs="0" />
                    </xsd:sequence>
                </xsd:complexType>
            </xsd:element>
            <xsd:element name="recibirTransferenciaInterbancariaResponse">
                <xsd:complexType>
                    <xsd:sequence>
                        <xsd:element name="resultado" type="xsd:string" />
                    </xsd:sequence>
                </xsd:complexType>
            </xsd:element>
        </xsd:schema>
    </types>

    <message name="consultarBancoInput">
        <part name="parameters" element="tns:consultarBancoRequest" />
    </message>
    <message name="consultarBancoOutput">
        <part name="parameters" element="tns:consultarBancoResponse" />
    </message>
    <message name="validarCuentaInput">
        <part name="parameters" element="tns:validarCuentaRequest" />
    </message>
    <message name="validarCuentaOutput">
        <part name="parameters" element="tns:validarCuentaResponse" />
    </message>
    <message name="consultarSaldoInput">
        <part name="parameters" element="tns:consultarSaldoRequest" />
    </message>
    <message name="consultarSaldoOutput">
        <part name="parameters" element="tns:consultarSaldoResponse" />
    </message>
    <message name="recibirTransferenciaInterbancariaInput">
        <part name="parameters" element="tns:recibirTransferenciaInterbancariaRequest" />
    </message>
    <message name="recibirTransferenciaInterbancariaOutput">
        <part name="parameters" element="tns:recibirTransferenciaInterbancariaResponse" />
    </message>

    <portType name="BancoPortType">
        <operation name="consultarBanco">
            <input message="tns:consultarBancoInput" />
            <output message="tns:consultarBancoOutput" />
        </operation>
        <operation name="validarCuenta">
            <input message="tns:validarCuentaInput" />
            <output message="tns:validarCuentaOutput" />
        </operation>
        <operation name="consultarSaldo">
            <input message="tns:consultarSaldoInput" />
            <output message="tns:consultarSaldoOutput" />
        </operation>
        <operation name="recibirTransferenciaInterbancaria">
            <input message="tns:recibirTransferenciaInterbancariaInput" />
            <output message="tns:recibirTransferenciaInterbancariaOutput" />
        </operation>
    </portType>

    <binding name="BancoBinding" type="tns:BancoPortType">
        <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http" />
        <operation name="consultarBanco">
            <soap:operation soapAction="${SOAP_NAMESPACE}/consultarBanco" />
            <input><soap:body use="literal" /></input>
            <output><soap:body use="literal" /></output>
        </operation>
        <operation name="validarCuenta">
            <soap:operation soapAction="${SOAP_NAMESPACE}/validarCuenta" />
            <input><soap:body use="literal" /></input>
            <output><soap:body use="literal" /></output>
        </operation>
        <operation name="consultarSaldo">
            <soap:operation soapAction="${SOAP_NAMESPACE}/consultarSaldo" />
            <input><soap:body use="literal" /></input>
            <output><soap:body use="literal" /></output>
        </operation>
        <operation name="recibirTransferenciaInterbancaria">
            <soap:operation soapAction="${SOAP_NAMESPACE}/recibirTransferenciaInterbancaria" />
            <input><soap:body use="literal" /></input>
            <output><soap:body use="literal" /></output>
        </operation>
    </binding>

    <service name="BancoWebService">
        <documentation>Web Service SOAP academico para BancoGT ERP Bancario.</documentation>
        <port name="BancoPort" binding="tns:BancoBinding">
            <soap:address location="${escapedServiceUrl}" />
        </port>
    </service>
</definitions>`;
}

function createSoapServices() {
    return {
        BancoWebService: {
            BancoPort: {
                consultarBanco,
                validarCuenta,
                consultarSaldo,
                recibirTransferenciaInterbancaria
            }
        }
    };
}

function setupSoapWebService(app) {
    const serviceUrl = getSoapServiceUrl();
    const wsdl = buildWsdl(serviceUrl);
    const wsdlHandler = serveWsdl(wsdl);

    app.get(SOAP_PATH, wsdlHandler);
    app.get(`${SOAP_PATH}/`, wsdlHandler);

    const server = soap.listen(app, SOAP_PATH, createSoapServices(), wsdl, (error) => {
        if (error) {
            console.error('[SOAP] error iniciando servicio:', error.message);
            return;
        }

        console.log('[SOAP] servicio iniciado', {
            url: SOAP_PATH,
            wsdl: `${SOAP_PATH}?wsdl`
        });
    });

    return server;
}

module.exports = {
    SOAP_PATH,
    buildWsdl,
    setupSoapWebService
};

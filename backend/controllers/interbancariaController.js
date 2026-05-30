const PDFDocument = require('pdfkit');
const {
    listarBancosExternos,
    normalizeSwift,
    obtenerBancoPorSwift
} = require('../services/bancosExternosService');
const {
    InterbankError,
    LOCAL_BANK_SWIFT,
    getCuentaLocal,
    listarHistorialInterbancario,
    obtenerComprobanteInterbancario,
    procesarTransferenciaEntrante,
    procesarTransferenciaSaliente,
    validarApiKeyEntrante,
    validarCuentaExterna
} = require('../services/interbancariaService');
const { registrarEventoAuditoria } = require('../services/auditoriaService');

function sendError(res, error) {
    const status = error.statusCode || 500;
    const payload = {
        success: false,
        error: error.message || 'Error procesando operacion interbancaria'
    };

    if (error.details) {
        payload.details = error.details;
    }

    res.status(status).json(payload);
}

function getHeader(req, name) {
    return req.headers[String(name).toLowerCase()];
}

function safeFilePart(value) {
    return String(value || 'comprobante').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function formatMoney(value, moneda = 'GTQ') {
    const amount = Number(value || 0);
    return `${moneda || 'GTQ'} ${amount.toFixed(2)}`;
}

function formatDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value || '-');
    }

    return date.toLocaleString('es-GT', {
        dateStyle: 'medium',
        timeStyle: 'medium'
    });
}

function sendPlainInterbankResult(res, estado, context = {}) {
    const normalizedEstado = String(estado || '').trim().toUpperCase();
    const body = normalizedEstado === 'CONFIRMADA' ? 'APROBADO' : 'RECHAZADO';

    console.log('[Interbank][INCOMING] respuesta publica', {
        estado: normalizedEstado || null,
        body,
        ...context
    });

    return res.status(200).type('text/plain').send(body);
}

function drawField(doc, label, value, x, y, width = 230) {
    doc.fontSize(8).fillColor('#6c757d').font('Helvetica-Bold').text(label, x, y, { width });
    doc.fontSize(10).fillColor('#1f2933').font('Helvetica').text(String(value || '-'), x, y + 13, { width });
}

function generarComprobantePdf(res, comprobante) {
    const doc = new PDFDocument({ size: 'LETTER', margin: 48 });

    doc.pipe(res);

    doc.rect(0, 0, doc.page.width, 92).fill('#1a472a');
    doc.circle(78, 46, 24).fill('#ffd700');
    doc.fillColor('#1a472a').font('Helvetica-Bold').fontSize(15).text('BI', 68, 37);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(19).text(comprobante.bancoNombre, 112, 28);
    doc.font('Helvetica').fontSize(10).text(`SWIFT local: ${comprobante.swiftLocal}`, 112, 55);

    doc.fillColor('#1f2933').font('Helvetica-Bold').fontSize(18).text('Comprobante de transferencia interbancaria', 48, 126);
    doc.moveTo(48, 154).lineTo(564, 154).strokeColor('#d9e2ec').stroke();

    doc.roundedRect(48, 174, 516, 84, 6).fillAndStroke('#f8fafc', '#d9e2ec');
    drawField(doc, 'Estado', comprobante.estado, 66, 192, 140);
    drawField(doc, 'Tipo', comprobante.tipo, 214, 192, 120);
    drawField(doc, 'Monto', formatMoney(comprobante.monto, comprobante.moneda), 342, 192, 180);
    drawField(doc, 'Fecha y hora', formatDate(comprobante.fecha), 66, 226, 260);
    drawField(doc, 'Referencia interna', comprobante.referenciaInterna, 342, 226, 180);

    const leftX = 66;
    const rightX = 322;
    let y = 292;

    doc.fillColor('#1a472a').font('Helvetica-Bold').fontSize(12).text('Datos de la operacion', 48, y);
    y += 28;

    drawField(doc, 'Cuenta origen', comprobante.cuentaOrigen, leftX, y);
    drawField(doc, 'Cuenta destino', comprobante.cuentaDestino, rightX, y);
    y += 52;

    drawField(doc, 'Banco origen', comprobante.bancoOrigen, leftX, y);
    drawField(doc, 'Banco destino', comprobante.bancoDestino, rightX, y);
    y += 52;

    drawField(doc, 'Referencia externa', comprobante.referenciaExterna || '-', leftX, y);
    drawField(doc, 'Descripcion', comprobante.descripcion, rightX, y);
    y += 72;

    doc.roundedRect(48, y, 516, 58, 6).fillAndStroke('#f8fafc', '#d9e2ec');
    doc.fillColor('#52616b').font('Helvetica').fontSize(9)
        .text('Este comprobante fue generado electronicamente por Banco Industrial. Conserve la referencia interna para consultas o seguimiento de la operacion.', 66, y + 18, { width: 480 });

    doc.fillColor('#9aa5b1').fontSize(8)
        .text(`Generado: ${formatDate(new Date())}`, 48, 720, { align: 'center', width: 516 });

    doc.end();
}

async function listarBancos(req, res) {
    try {
        const bancos = await listarBancosExternos({ soloActivos: true });
        res.json({ success: true, bancos });
    } catch (error) {
        sendError(res, error);
    }
}

async function historial(req, res) {
    try {
        const historial = await listarHistorialInterbancario(req.user, {
            limit: req.query.limit
        });

        res.json({
            success: true,
            historial
        });
    } catch (error) {
        sendError(res, error);
    }
}

async function comprobante(req, res) {
    try {
        const referencia = req.params.referencia;
        const comprobante = await obtenerComprobanteInterbancario(req.user, referencia);
        const filename = `comprobante-${safeFilePart(referencia)}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        await registrarEventoAuditoria({
            req,
            accion: 'DESCARGA_COMPROBANTE',
            modulo: 'INTERBANCARIA',
            descripcion: 'Descarga de comprobante interbancario',
            estado: 'OK',
            metadata: {
                referencia,
                filename,
                tipo: comprobante.tipo,
                monto: comprobante.monto,
                estado: comprobante.estado
            }
        });

        generarComprobantePdf(res, comprobante);
    } catch (error) {
        await registrarEventoAuditoria({
            req,
            accion: 'DESCARGA_COMPROBANTE',
            modulo: 'INTERBANCARIA',
            descripcion: 'Error al descargar comprobante interbancario',
            estado: 'ERROR',
            metadata: { error: error.message, referencia: req.params.referencia }
        });
        sendError(res, error);
    }
}

async function validarCuenta(req, res) {
    try {
        const swift = normalizeSwift(req.body.swiftDestino || req.body.SwiftDestino || req.body.bancoDestinoSwift || req.body.swift);
        const numeroCuenta = req.body.cuentaDestino
            || req.body.numeroCuenta
            || req.body.CuentaDestino
            || req.body.cuentaDestinoExterna
            || req.body.numero_cuenta;

        if (!swift || !numeroCuenta) {
            throw new InterbankError(400, 'swift y numeroCuenta/cuentaDestino son requeridos');
        }

        if (swift === LOCAL_BANK_SWIFT) {
            const cuentaLocal = await getCuentaLocal(numeroCuenta);
            return res.json({
                success: true,
                local: true,
                valida: !!cuentaLocal,
                cuenta: cuentaLocal
                    ? {
                        numeroCuenta: cuentaLocal.numero_cuenta,
                        titular: `${cuentaLocal.nombre} ${cuentaLocal.apellido}`.trim(),
                        estado: cuentaLocal.estado
                    }
                    : null
            });
        }

        const banco = await obtenerBancoPorSwift(swift);
        if (!banco) {
            throw new InterbankError(404, 'Banco destino no encontrado o inactivo');
        }

        const validacion = await validarCuentaExterna(banco, req.body);

        res.status(validacion.valid ? 200 : 400).json({
            success: validacion.valid,
            valida: validacion.valid,
            banco: {
                nombre: banco.nombre,
                swift: banco.swift
            },
            respuestaBanco: validacion.data
        });
    } catch (error) {
        sendError(res, error);
    }
}

async function transferir(req, res) {
    try {
        const result = await procesarTransferenciaSaliente(req.body, req.user);

        if (result.duplicate) {
            return res.json({
                success: true,
                duplicate: true,
                message: 'Transferencia ya procesada con este idempotencyKey',
                transferencia: result.transferencia
            });
        }

        await registrarEventoAuditoria({
            req,
            accion: 'TRANSFERENCIA_INTERBANCARIA_SALIENTE',
            modulo: 'INTERBANCARIA',
            descripcion: 'Transferencia interbancaria saliente confirmada',
            estado: 'OK',
            metadata: {
                referenciaInterna: result.referenciaInterna,
                referenciaExterna: result.referenciaExterna,
                id: result.id,
                saldoNuevo: result.saldoNuevo,
                body: req.body
            }
        });

        res.status(201).json({
            success: true,
            message: 'Transferencia interbancaria enviada',
            transferencia: result
        });
    } catch (error) {
        await registrarEventoAuditoria({
            req,
            accion: 'TRANSFERENCIA_INTERBANCARIA_SALIENTE',
            modulo: 'INTERBANCARIA',
            descripcion: 'Error en transferencia interbancaria saliente',
            estado: error.statusCode && error.statusCode < 500 ? 'FALLIDO' : 'ERROR',
            metadata: { error: error.message, body: req.body, details: error.details }
        });
        sendError(res, error);
    }
}

async function entrante(req, res) {
    try {
        const swiftOrigen = normalizeSwift(
            req.body.swiftOrigen
            || req.body.SwiftOrigen
            || req.body.swift_origen
            || req.body.bancoOrigenSwift
            || req.body.bancoOrigen
            || req.body.BancoOrigen
            || req.body.swift
            || getHeader(req, 'x-bank-swift')
        );
        const apiKey = getHeader(req, 'x-api-key');
        const requireApiKey = String(process.env.INTERBANK_REQUIRE_API_KEY || '').toLowerCase() === 'true';

        if (requireApiKey || apiKey) {
            const validApiKey = await validarApiKeyEntrante(apiKey, swiftOrigen);
            if (!validApiKey) {
                throw new InterbankError(401, 'API key interbancaria invalida');
            }
        }

        const result = await procesarTransferenciaEntrante(req.body, req.headers);

        if (result.duplicate) {
            const estadoDuplicado = result.transferencia?.estado || 'CONFIRMADA';

            await registrarEventoAuditoria({
                req,
                accion: 'TRANSFERENCIA_INTERBANCARIA_ENTRANTE',
                modulo: 'INTERBANCARIA',
                descripcion: 'Transferencia interbancaria entrante duplicada',
                estado: 'OK',
                metadata: { body: req.body, transferencia: result.transferencia, respuestaPublica: estadoDuplicado }
            });

            return sendPlainInterbankResult(res, estadoDuplicado, {
                duplicate: true,
                referenciaInterna: result.transferencia?.referencia_interna || null
            });
        }

        if (result.rejected) {
            await registrarEventoAuditoria({
                req,
                accion: 'TRANSFERENCIA_INTERBANCARIA_ENTRANTE',
                modulo: 'INTERBANCARIA',
                descripcion: 'Transferencia interbancaria entrante rechazada',
                estado: 'RECHAZADA',
                metadata: { body: req.body, result, respuestaPublica: 'RECHAZADO' }
            });

            return sendPlainInterbankResult(res, result.estado || 'RECHAZADA', {
                rejected: true,
                referenciaInterna: result.referenciaInterna,
                error: result.error
            });
        }

        await registrarEventoAuditoria({
            req,
            accion: 'TRANSFERENCIA_INTERBANCARIA_ENTRANTE',
            modulo: 'INTERBANCARIA',
            descripcion: 'Transferencia interbancaria entrante confirmada',
            estado: 'OK',
            metadata: {
                body: req.body,
                id: result.id,
                referenciaInterna: result.referenciaInterna,
                saldoNuevo: result.saldoNuevo,
                respuestaPublica: 'APROBADO'
            }
        });

        return sendPlainInterbankResult(res, result.estado || 'CONFIRMADA', {
            referenciaInterna: result.referenciaInterna,
            id: result.id
        });
    } catch (error) {
        await registrarEventoAuditoria({
            req,
            accion: 'TRANSFERENCIA_INTERBANCARIA_ENTRANTE',
            modulo: 'INTERBANCARIA',
            descripcion: 'Error en transferencia interbancaria entrante',
            estado: error.statusCode && error.statusCode < 500 ? 'FALLIDO' : 'ERROR',
            metadata: { error: error.message, body: req.body, details: error.details }
        });
        sendError(res, error);
    }
}

module.exports = {
    comprobante,
    entrante,
    historial,
    listarBancos,
    transferir,
    validarCuenta
};

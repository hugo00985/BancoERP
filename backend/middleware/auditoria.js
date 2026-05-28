const { registrarEventoAuditoria } = require('../services/auditoriaService');

function auditarAccion(accion, modulo, options = {}) {
    return (req, res, next) => {
        res.on('finish', () => {
            const success = res.statusCode >= 200 && res.statusCode < 400;

            if (options.soloExitos && !success) {
                return;
            }

            registrarEventoAuditoria({
                req,
                accion,
                modulo,
                descripcion: typeof options.descripcion === 'function'
                    ? options.descripcion(req, res)
                    : options.descripcion,
                estado: success ? 'OK' : 'ERROR',
                metadata: typeof options.metadata === 'function'
                    ? options.metadata(req, res)
                    : (options.metadata || { statusCode: res.statusCode })
            });
        });

        next();
    };
}

async function auditarErrorCritico(error, req, modulo = 'SISTEMA') {
    await registrarEventoAuditoria({
        req,
        accion: 'ERROR_CRITICO',
        modulo,
        descripcion: error.message || 'Error critico',
        estado: 'ERROR',
        metadata: {
            path: req?.originalUrl,
            method: req?.method,
            stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
        }
    });
}

async function auditarAccesoDenegado(req, rolesPermitidos = []) {
    await registrarEventoAuditoria({
        req,
        accion: 'ACCESO_DENEGADO_ROL',
        modulo: 'SEGURIDAD',
        descripcion: 'Acceso denegado por rol insuficiente',
        estado: 'DENEGADO',
        metadata: {
            path: req.originalUrl,
            method: req.method,
            rolActual: req.user?.rol || null,
            rolesPermitidos
        }
    });
}

module.exports = {
    auditarAccesoDenegado,
    auditarAccion,
    auditarErrorCritico
};

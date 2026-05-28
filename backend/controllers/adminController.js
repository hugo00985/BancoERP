const db = require('../config/db');
const {
    listarEventosAuditoria,
    obtenerResumenAuditoria
} = require('../services/auditoriaService');

function normalizeLimit(value, fallback = 100, max = 500) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }

    return Math.min(Math.floor(parsed), max);
}

async function getResumenERP(req, res) {
    try {
        const [clientes] = await db.query(
            'SELECT COUNT(*)::int AS total FROM cliente WHERE estado = TRUE'
        );
        const [cuentas] = await db.query(
            `SELECT COUNT(*)::int AS total,
                    COALESCE(SUM(saldo), 0)::numeric AS saldo_total
             FROM cuenta`
        );
        const [transferenciasLocales] = await db.query(
            `SELECT COUNT(*)::int AS total
             FROM transferencia
             WHERE fecha_transferencia::date = CURRENT_DATE`
        );
        const [interbancarias] = await db.query(
            `SELECT
                COUNT(*) FILTER (WHERE estado = 'CONFIRMADA')::int AS confirmadas,
                COUNT(*) FILTER (WHERE estado = 'RECHAZADA')::int AS rechazadas
             FROM transferencias_interbancarias`
        );

        res.json({
            success: true,
            resumen: {
                totalClientes: clientes[0]?.total || 0,
                totalCuentas: cuentas[0]?.total || 0,
                saldoTotalAdministrado: Number(cuentas[0]?.saldo_total || 0),
                transferenciasLocalesDia: transferenciasLocales[0]?.total || 0,
                interbancariasConfirmadas: interbancarias[0]?.confirmadas || 0,
                interbancariasRechazadas: interbancarias[0]?.rechazadas || 0
            }
        });
    } catch (error) {
        console.error('Error en resumen ERP:', error);
        res.status(500).json({ success: false, error: 'Error al obtener resumen ERP' });
    }
}

async function listarCuentasERP(req, res) {
    try {
        const limit = normalizeLimit(req.query.limit, 100, 500);
        const [cuentas] = await db.query(
            `SELECT c.numero_cuenta,
                    CONCAT(cl.nombre, ' ', cl.apellido) AS cliente,
                    tc.nombre_tipo AS tipo,
                    c.saldo,
                    c.estado
             FROM cuenta c
             JOIN cliente cl ON c.id_cliente = cl.id_cliente
             JOIN tipo_cuenta tc ON c.id_tipo_cuenta = tc.id_tipo_cuenta
             ORDER BY c.id_cuenta DESC
             LIMIT $1`,
            [limit]
        );

        res.json({ success: true, cuentas });
    } catch (error) {
        console.error('Error listando cuentas ERP:', error);
        res.status(500).json({ success: false, error: 'Error al obtener cuentas' });
    }
}

async function listarInterbancariasERP(req, res) {
    try {
        const limit = normalizeLimit(req.query.limit, 100, 500);
        const [transferencias] = await db.query(
            `SELECT fecha_creacion AS fecha,
                    tipo,
                    banco_origen_swift,
                    banco_destino_swift,
                    banco_destino_nombre,
                    monto,
                    moneda,
                    estado,
                    referencia_interna
             FROM transferencias_interbancarias
             ORDER BY fecha_creacion DESC
             LIMIT $1`,
            [limit]
        );

        res.json({ success: true, transferencias });
    } catch (error) {
        console.error('Error listando interbancarias ERP:', error);
        res.status(500).json({ success: false, error: 'Error al obtener transferencias interbancarias' });
    }
}

async function listarBancosExternosERP(req, res) {
    try {
        const [bancos] = await db.query(
            `SELECT nombre,
                    swift,
                    base_url,
                    activo
             FROM bancos_externos
             ORDER BY nombre ASC`
        );

        res.json({ success: true, bancos });
    } catch (error) {
        console.error('Error listando bancos externos ERP:', error);
        res.status(500).json({ success: false, error: 'Error al obtener bancos externos' });
    }
}

async function listarAuditoriaERP(req, res) {
    try {
        const eventos = await listarEventosAuditoria(req.query);
        res.json({ success: true, eventos });
    } catch (error) {
        console.error('Error listando auditoria ERP:', error);
        res.status(500).json({ success: false, error: 'Error al obtener auditoria' });
    }
}

async function getResumenAuditoriaERP(req, res) {
    try {
        const resumen = await obtenerResumenAuditoria(req.query);
        res.json({ success: true, resumen });
    } catch (error) {
        console.error('Error en resumen auditoria ERP:', error);
        res.status(500).json({ success: false, error: 'Error al obtener resumen de auditoria' });
    }
}

module.exports = {
    getResumenERP,
    getResumenAuditoriaERP,
    listarAuditoriaERP,
    listarBancosExternosERP,
    listarCuentasERP,
    listarInterbancariasERP
};

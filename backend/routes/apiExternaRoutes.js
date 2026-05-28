const express = require('express');
const db = require('../config/db');
const router = express.Router();

// GET /api/externa/resumen-dia
router.get('/resumen-dia', async (req, res) => {
    try {
        const hoy = new Date().toISOString().split('T')[0];
        
        const [transferencias] = await db.query(
            'SELECT COUNT(*) as total, COALESCE(SUM(monto), 0) as total_monto FROM transferencia WHERE fecha_transferencia::date = $1 AND id_estado_transferencia = 3',
            [hoy]
        );
        
        const [depositos] = await db.query(
            `SELECT COUNT(*) as total, COALESCE(SUM(m.monto), 0) as total_monto
             FROM movimiento m
             JOIN tipo_movimiento tm ON m.id_tipo_movimiento = tm.id_tipo_movimiento
             WHERE m.fecha_movimiento::date = $1 AND tm.nombre_tipo IN ('Deposito', 'Depósito')`,
            [hoy]
        );
        
        const [retiros] = await db.query(
            `SELECT COUNT(*) as total, COALESCE(SUM(m.monto), 0) as total_monto
             FROM movimiento m
             JOIN tipo_movimiento tm ON m.id_tipo_movimiento = tm.id_tipo_movimiento
             WHERE m.fecha_movimiento::date = $1 AND tm.nombre_tipo = 'Retiro'`,
            [hoy]
        );
        
        res.json({
            fecha: hoy,
            transferencias: {
                cantidad: transferencias[0].total,
                monto_total: parseFloat(transferencias[0].total_monto)
            },
            depositos: {
                cantidad: depositos[0].total,
                monto_total: parseFloat(depositos[0].total_monto)
            },
            retiros: {
                cantidad: retiros[0].total,
                monto_total: parseFloat(retiros[0].total_monto)
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/externa/transacciones-por-usuario
router.get('/transacciones-por-usuario', async (req, res) => {
    try {
        const hoy = new Date().toISOString().split('T')[0];
        
        const [resultados] = await db.query(
            `SELECT 
                u.nombre_usuario,
                u.id_rol,
                r.nombre as rol_nombre,
                COUNT(m.id_movimiento) as total_transacciones,
                COALESCE(SUM(CASE WHEN tm.signo = '+' THEN m.monto ELSE 0 END), 0) as total_ingresos,
                COALESCE(SUM(CASE WHEN tm.signo = '-' THEN m.monto ELSE 0 END), 0) as total_egresos
             FROM movimiento m
             LEFT JOIN usuario u ON m.id_cajero = u.id_usuario
             LEFT JOIN rol r ON u.id_rol = r.id_rol
             LEFT JOIN tipo_movimiento tm ON m.id_tipo_movimiento = tm.id_tipo_movimiento
             WHERE m.fecha_movimiento::date = $1
             GROUP BY u.id_usuario, u.nombre_usuario, u.id_rol, r.nombre
             ORDER BY total_transacciones DESC`,
            [hoy]
        );
        
        res.json(resultados);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/externa/transaccion-simulada
router.post('/transaccion-simulada', async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { numero_cuenta, tipo, monto, referencia, origen } = req.body;
        
        if (!numero_cuenta || !tipo || !monto) {
            return res.status(400).json({ error: 'Faltan datos requeridos' });
        }
        
        const [cuentas] = await connection.query(
            'SELECT * FROM cuenta WHERE numero_cuenta = $1 AND estado = \'ACTIVA\'',
            [numero_cuenta]
        );
        
        if (cuentas.length === 0) {
            throw new Error('Cuenta no encontrada');
        }
        
        const cuenta = cuentas[0];
        const saldoAnterior = parseFloat(cuenta.saldo);
        let saldoNuevo = saldoAnterior;
        let idTipoMovimiento;
        
        if (tipo.toUpperCase() === 'DEPOSITO') {
            saldoNuevo = saldoAnterior + monto;
            idTipoMovimiento = 1;
        } else if (tipo.toUpperCase() === 'RETIRO') {
            if (saldoAnterior < monto) {
                throw new Error('Saldo insuficiente');
            }
            saldoNuevo = saldoAnterior - monto;
            idTipoMovimiento = 2;
        } else {
            throw new Error('Tipo de transacción no válido. Use DEPOSITO o RETIRO');
        }
        
        await connection.query('UPDATE cuenta SET saldo = $1 WHERE id_cuenta = $2', [saldoNuevo, cuenta.id_cuenta]);
        
        await connection.query(
            `INSERT INTO movimiento (id_cuenta, id_tipo_movimiento, monto, saldo_anterior, saldo_nuevo, descripcion)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [cuenta.id_cuenta, idTipoMovimiento, monto, saldoAnterior, saldoNuevo, referencia || `Transacción externa desde ${origen || 'APP_EXTERNA'}`]
        );
        
        await connection.commit();
        
        res.json({
            success: true,
            message: `${tipo} simulado exitosamente`,
            cuenta: numero_cuenta,
            monto: monto,
            saldo_anterior: saldoAnterior,
            saldo_nuevo: saldoNuevo,
            origen: origen || 'APP_EXTERNA'
        });
        
    } catch (error) {
        await connection.rollback();
        res.status(400).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// GET /api/externa/estado-cuenta/:numero
router.get('/estado-cuenta/:numero', async (req, res) => {
    try {
        const { numero } = req.params;
        
        const [cuentas] = await db.query(
            `SELECT c.numero_cuenta, c.saldo, c.estado, cl.nombre, cl.apellido, cl.dpi
             FROM cuenta c
             JOIN cliente cl ON c.id_cliente = cl.id_cliente
             WHERE c.numero_cuenta = $1`,
            [numero]
        );
        
        if (cuentas.length === 0) {
            return res.status(404).json({ error: 'Cuenta no encontrada' });
        }
        
        const [movimientos] = await db.query(
            `SELECT m.fecha_movimiento, tm.nombre_tipo as tipo, m.monto, m.saldo_nuevo, m.descripcion
             FROM movimiento m
             JOIN tipo_movimiento tm ON m.id_tipo_movimiento = tm.id_tipo_movimiento
             WHERE m.id_cuenta = (SELECT id_cuenta FROM cuenta WHERE numero_cuenta = $1)
             ORDER BY m.fecha_movimiento DESC
             LIMIT 20`,
            [numero]
        );
        
        res.json({
            cuenta: cuentas[0],
            movimientos_recientes: movimientos
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

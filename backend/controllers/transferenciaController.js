const db = require('../config/db');
const { registrarEventoAuditoria } = require('../services/auditoriaService');

const realizarTransferencia = async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { cuenta_origen, cuenta_destino, monto, referencia, descripcion } = req.body;
        const id_cajero = req.user.rol === 'CAJERO' || req.user.rol === 'ADMIN' ? req.user.id_usuario : null;
        
        const [cuentasOrigen] = await connection.query(
            'SELECT * FROM cuenta WHERE numero_cuenta = $1 AND estado = \'ACTIVA\'',
            [cuenta_origen]
        );
        
        if (cuentasOrigen.length === 0) {
            throw new Error('Cuenta origen no válida');
        }
        
        const cuentaOrigen = cuentasOrigen[0];
        
        if (cuentaOrigen.saldo < monto) {
            throw new Error('Saldo insuficiente');
        }
        
        const [cuentasDestino] = await connection.query(
            'SELECT * FROM cuenta WHERE numero_cuenta = $1 AND estado = \'ACTIVA\'',
            [cuenta_destino]
        );
        
        if (cuentasDestino.length === 0) {
            throw new Error('Cuenta destino no válida');
        }
        
        const cuentaDestino = cuentasDestino[0];
        
        const [transferencia] = await connection.query(
            `INSERT INTO transferencia (id_cuenta_origen, id_cuenta_destino, monto, referencia, descripcion, id_estado_transferencia, id_cajero)
             VALUES ($1, $2, $3, $4, $5, (SELECT id_estado_transferencia FROM estado_transferencia WHERE nombre = 'Completada'), $6)
             RETURNING id_transferencia AS id`,
            [cuentaOrigen.id_cuenta, cuentaDestino.id_cuenta, monto, referencia, descripcion, id_cajero]
        );
        
        const saldoOrigenNuevo = cuentaOrigen.saldo - monto;
        const saldoDestinoNuevo = parseFloat(cuentaDestino.saldo) + parseFloat(monto);
        
        await connection.query('UPDATE cuenta SET saldo = $1 WHERE id_cuenta = $2', [saldoOrigenNuevo, cuentaOrigen.id_cuenta]);
        await connection.query('UPDATE cuenta SET saldo = $1 WHERE id_cuenta = $2', [saldoDestinoNuevo, cuentaDestino.id_cuenta]);
        
        await connection.query(
            `INSERT INTO movimiento (id_cuenta, id_tipo_movimiento, monto, saldo_anterior, saldo_nuevo, descripcion, id_transferencia, id_cajero, tipo_operacion)
             VALUES ($1, (SELECT id_tipo_movimiento FROM tipo_movimiento WHERE nombre_tipo = 'Transferencia Enviada'), $2, $3, $4, $5, $6, $7, 'TRANSFERENCIA')`,
            [cuentaOrigen.id_cuenta, monto, cuentaOrigen.saldo, saldoOrigenNuevo, descripcion, transferencia.insertId, id_cajero]
        );
        
        await connection.query(
            `INSERT INTO movimiento (id_cuenta, id_tipo_movimiento, monto, saldo_anterior, saldo_nuevo, descripcion, id_transferencia, id_cajero, tipo_operacion)
             VALUES ($1, (SELECT id_tipo_movimiento FROM tipo_movimiento WHERE nombre_tipo = 'Transferencia Recibida'), $2, $3, $4, $5, $6, $7, 'TRANSFERENCIA')`,
            [cuentaDestino.id_cuenta, monto, cuentaDestino.saldo, saldoDestinoNuevo, descripcion, transferencia.insertId, id_cajero]
        );
        
        await connection.commit();

        await registrarEventoAuditoria({
            req,
            accion: 'TRANSFERENCIA_LOCAL',
            modulo: 'TRANSFERENCIAS',
            descripcion: 'Transferencia local confirmada',
            estado: 'OK',
            metadata: {
                id_transferencia: transferencia.insertId,
                cuenta_origen,
                cuenta_destino,
                monto,
                referencia
            }
        });
        
        try {
        // Obtener usuario para notificación
        const [clienteOrigen] = await connection.query(
            'SELECT u.nombre_usuario FROM usuario u JOIN cliente c ON u.id_cliente = c.id_cliente JOIN cuenta ct ON c.id_cliente = ct.id_cliente WHERE ct.id_cuenta = $1',
            [cuentaOrigen.id_cuenta]
        );
        const [clienteDestino] = await connection.query(
            'SELECT u.nombre_usuario FROM usuario u JOIN cliente c ON u.id_cliente = c.id_cliente JOIN cuenta ct ON c.id_cliente = ct.id_cliente WHERE ct.id_cuenta = $1',
            [cuentaDestino.id_cuenta]
        );
        
        if (clienteOrigen.length > 0) {
            const { notificarTransferencia } = require('../services/telegramService');
            await notificarTransferencia(clienteOrigen[0].nombre_usuario, cuenta_origen, cuenta_destino, monto, saldoOrigenNuevo);
        }

        if (clienteDestino.length > 0) {
            const { notificarTransferenciaRecibida } = require('../services/telegramService');
            await notificarTransferenciaRecibida(
                clienteDestino[0].nombre_usuario,
                cuenta_origen,
                cuenta_destino,
                monto,
                saldoDestinoNuevo
            );
        }
        } catch (telegramError) {
            console.error('[Telegram] error:', telegramError.message);
        }
        
        res.json({ message: 'Transferencia realizada exitosamente', id_transferencia: transferencia.insertId });
    } catch (error) {
        await connection.rollback();
        await registrarEventoAuditoria({
            req,
            accion: 'ERROR_CRITICO',
            modulo: 'TRANSFERENCIAS',
            descripcion: 'Error en transferencia local',
            estado: 'ERROR',
            metadata: {
                error: error.message,
                cuenta_origen: req.body?.cuenta_origen,
                cuenta_destino: req.body?.cuenta_destino,
                monto: req.body?.monto
            }
        });
        res.status(400).json({ error: error.message });
    } finally {
        connection.release();
    }
};

const getHistorialTransferencias = async (req, res) => {
    try {
        const { id_cuenta } = req.params;
        const [transferencias] = await db.query(
            `SELECT t.*, 
                    co.numero_cuenta as cuenta_origen_num, 
                    cd.numero_cuenta as cuenta_destino_num,
                    et.nombre as estado_nombre
             FROM transferencia t
             JOIN cuenta co ON t.id_cuenta_origen = co.id_cuenta
             JOIN cuenta cd ON t.id_cuenta_destino = cd.id_cuenta
             JOIN estado_transferencia et ON t.id_estado_transferencia = et.id_estado_transferencia
             WHERE t.id_cuenta_origen = $1 OR t.id_cuenta_destino = $2
             ORDER BY t.fecha_transferencia DESC
             LIMIT 50`,
            [id_cuenta, id_cuenta]
        );
        res.json(transferencias);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener historial' });
    }
};

module.exports = { realizarTransferencia, getHistorialTransferencias };

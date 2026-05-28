const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { notificarDeposito, notificarRetiro } = require('../services/telegramService');

const getResumenDia = async (req, res) => {
    try {
        // Obtener la fecha actual DIRECTAMENTE de la base de datos
        const [fechaBD] = await db.query("SELECT CURRENT_DATE as fecha");
        const hoy = fechaBD[0].fecha;
        
        console.log('📅 Fecha de consulta (desde BD):', hoy);
        
        // Total de transferencias del día
        const [transferencias] = await db.query(
            `SELECT COUNT(*) as total, COALESCE(SUM(monto), 0) as monto_total
             FROM transferencia 
             WHERE fecha_transferencia::date = $1`,
            [hoy]
        );
        
        // Total de depósitos del día
        const [depositos] = await db.query(
            `SELECT COUNT(*) as total, COALESCE(SUM(monto), 0) as monto_total
             FROM movimiento
             WHERE fecha_movimiento::date = $1 AND id_tipo_movimiento = 1`,
            [hoy]
        );
        
        // Total de retiros del día
        const [retiros] = await db.query(
            `SELECT COUNT(*) as total, COALESCE(SUM(monto), 0) as monto_total
             FROM movimiento
             WHERE fecha_movimiento::date = $1 AND id_tipo_movimiento = 2`,
            [hoy]
        );
        
        // Cuentas nuevas del día
        const [cuentasNuevas] = await db.query(
            'SELECT COUNT(*) as total FROM cuenta WHERE fecha_apertura = $1',
            [hoy]
        );
        
        console.log('📊 Resultados:', {
            depositos: depositos[0].total,
            retiros: retiros[0].total,
            transferencias: transferencias[0].total
        });
        
        // Transacciones por usuario
        const [transaccionesPorUsuario] = await db.query(
            `SELECT 
                COALESCE(u.nombre_usuario, 'Sistema') as nombre_usuario,
                COALESCE(r.nombre, 'N/A') as rol_nombre,
                COUNT(m.id_movimiento) as total_transacciones,
                COALESCE(SUM(CASE WHEN tm.signo = '+' THEN m.monto ELSE 0 END), 0) as total_ingresos,
                COALESCE(SUM(CASE WHEN tm.signo = '-' THEN m.monto ELSE 0 END), 0) as total_egresos
             FROM movimiento m
             LEFT JOIN usuario u ON m.id_cajero = u.id_usuario
             LEFT JOIN rol r ON u.id_rol = r.id_rol
             LEFT JOIN tipo_movimiento tm ON m.id_tipo_movimiento = tm.id_tipo_movimiento
             WHERE m.fecha_movimiento::date = $1
             GROUP BY u.id_usuario, u.nombre_usuario, r.nombre
             ORDER BY total_transacciones DESC`,
            [hoy]
        );
        
        // Transacciones por hora
        const [transaccionesPorHora] = await db.query(
            `SELECT EXTRACT(HOUR FROM fecha_movimiento)::int as hora, COUNT(*) as total
             FROM movimiento
             WHERE fecha_movimiento::date = $1
             GROUP BY EXTRACT(HOUR FROM fecha_movimiento)
             ORDER BY hora ASC`,
            [hoy]
        );
        
        const horasMap = {};
        transaccionesPorHora.forEach(h => {
            horasMap[`${h.hora}:00`] = h.total;
        });
        
        for (let i = 0; i < 24; i++) {
            if (!horasMap[`${i}:00`]) {
                horasMap[`${i}:00`] = 0;
            }
        }
        
        // Montos por tipo de movimiento
        const [montosPorTipo] = await db.query(
            `SELECT tm.nombre_tipo, COALESCE(SUM(m.monto), 0) as total_monto
             FROM movimiento m
             JOIN tipo_movimiento tm ON m.id_tipo_movimiento = tm.id_tipo_movimiento
             WHERE m.fecha_movimiento::date = $1
             GROUP BY tm.nombre_tipo`,
            [hoy]
        );
        
        const montosMap = {};
        montosPorTipo.forEach(m => {
            montosMap[m.nombre_tipo] = parseFloat(m.total_monto);
        });
        
        // Movimientos recientes
        const [movimientosRecientes] = await db.query(
            `SELECT m.*, tm.nombre_tipo, tm.signo, c.numero_cuenta, COALESCE(u.nombre_usuario, 'Sistema') as usuario
             FROM movimiento m
             JOIN tipo_movimiento tm ON m.id_tipo_movimiento = tm.id_tipo_movimiento
             JOIN cuenta c ON m.id_cuenta = c.id_cuenta
             LEFT JOIN usuario u ON m.id_cajero = u.id_usuario
             WHERE m.fecha_movimiento::date = $1
             ORDER BY m.fecha_movimiento DESC
             LIMIT 20`,
            [hoy]
        );
        
        res.json({
            total_transferencias: transferencias[0].total,
            monto_transferencias: parseFloat(transferencias[0].monto_total),
            total_depositos: depositos[0].total,
            monto_depositos: parseFloat(depositos[0].monto_total),
            total_retiros: retiros[0].total,
            monto_retiros: parseFloat(retiros[0].monto_total),
            total_cuentas_nuevas: cuentasNuevas[0].total,
            transacciones_por_usuario: transaccionesPorUsuario,
            transacciones_por_hora: horasMap,
            montos_por_tipo: montosMap,
            movimientos_recientes: movimientosRecientes
        });
        
    } catch (error) {
        console.error('Error en resumen del día:', error);
        res.status(500).json({ error: 'Error al obtener resumen del día: ' + error.message });
    }
};

const realizarDeposito = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        
        const { numero_cuenta, monto, referencia } = req.body;
        
        const [cuentas] = await connection.query(
            'SELECT * FROM cuenta WHERE numero_cuenta = $1 AND estado = \'ACTIVA\'',
            [numero_cuenta]
        );
        
        if (cuentas.length === 0) throw new Error('Cuenta no encontrada');
        
        const cuenta = cuentas[0];
        const saldoAnterior = parseFloat(cuenta.saldo);
        const saldoNuevo = saldoAnterior + monto;
        
        await connection.query('UPDATE cuenta SET saldo = $1 WHERE id_cuenta = $2', [saldoNuevo, cuenta.id_cuenta]);
        
        await connection.query(
            `INSERT INTO movimiento (id_cuenta, id_tipo_movimiento, monto, saldo_anterior, saldo_nuevo, descripcion, id_cajero)
             VALUES ($1, 1, $2, $3, $4, $5, $6)`,
            [cuenta.id_cuenta, monto, saldoAnterior, saldoNuevo, referencia || 'Depósito en ventanilla', req.user.id_usuario]
        );
        
        const [cliente] = await connection.query(
            'SELECT u.nombre_usuario FROM usuario u JOIN cliente c ON u.id_cliente = c.id_cliente WHERE c.id_cliente = $1',
            [cuenta.id_cliente]
        );
        
        await connection.commit();
        
        if (cliente.length > 0) {
            await notificarDeposito(cliente[0].nombre_usuario, numero_cuenta, monto, saldoNuevo);
        }
        
        res.json({ message: `Depósito de Q${monto} realizado a la cuenta ${numero_cuenta}`, nuevo_saldo: saldoNuevo });
    } catch (error) {
        await connection.rollback();
        res.status(400).json({ error: error.message });
    } finally {
        connection.release();
    }
};

const realizarRetiro = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        
        const { numero_cuenta, monto, referencia } = req.body;
        
        const [cuentas] = await connection.query(
            'SELECT * FROM cuenta WHERE numero_cuenta = $1 AND estado = \'ACTIVA\'',
            [numero_cuenta]
        );
        
        if (cuentas.length === 0) throw new Error('Cuenta no encontrada');
        
        const cuenta = cuentas[0];
        const saldoAnterior = parseFloat(cuenta.saldo);
        
        if (saldoAnterior < monto) throw new Error('Saldo insuficiente');
        
        const saldoNuevo = saldoAnterior - monto;
        
        await connection.query('UPDATE cuenta SET saldo = $1 WHERE id_cuenta = $2', [saldoNuevo, cuenta.id_cuenta]);
        
        await connection.query(
            `INSERT INTO movimiento (id_cuenta, id_tipo_movimiento, monto, saldo_anterior, saldo_nuevo, descripcion, id_cajero)
             VALUES ($1, 2, $2, $3, $4, $5, $6)`,
            [cuenta.id_cuenta, monto, saldoAnterior, saldoNuevo, referencia || 'Retiro en ventanilla', req.user.id_usuario]
        );
        
        const [cliente] = await connection.query(
            'SELECT u.nombre_usuario FROM usuario u JOIN cliente c ON u.id_cliente = c.id_cliente WHERE c.id_cliente = $1',
            [cuenta.id_cliente]
        );
        
        await connection.commit();
        
        if (cliente.length > 0) {
            await notificarRetiro(cliente[0].nombre_usuario, numero_cuenta, monto, saldoNuevo);
        }
        
        res.json({ message: `Retiro de Q${monto} realizado de la cuenta ${numero_cuenta}`, nuevo_saldo: saldoNuevo });
    } catch (error) {
        await connection.rollback();
        res.status(400).json({ error: error.message });
    } finally {
        connection.release();
    }
};

const aperturaCuenta = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        
        const { dpi, nombre, apellido, telefono, correo, direccion,
                id_banco, id_tipo_cuenta, id_moneda, monto_apertura } = req.body;
        
        if (!dpi) throw new Error('DPI es requerido');
        
        // Verificar si el DPI ya tiene cuenta activa
        const [cuentaExistente] = await connection.query(
            `SELECT c.*, cl.dpi, cl.nombre, cl.apellido
             FROM cuenta c
             JOIN cliente cl ON c.id_cliente = cl.id_cliente
             WHERE cl.dpi = $1 AND c.estado = 'ACTIVA'`,
            [dpi]
        );
        
        if (cuentaExistente.length > 0) {
            await connection.rollback();
            return res.status(400).json({ 
                error: `El DPI ${dpi} ya tiene una cuenta activa`,
                cuenta_existente: {
                    numero_cuenta: cuentaExistente[0].numero_cuenta,
                    titular: `${cuentaExistente[0].nombre} ${cuentaExistente[0].apellido}`
                }
            });
        }
        
        // Buscar cliente existente por DPI
        let [clienteExistente] = await connection.query(
            'SELECT * FROM cliente WHERE dpi = $1',
            [dpi]
        );
        
        let id_cliente;
        let id_usuario;
        let datosCliente = {};
        let nombre_usuario = '';
        
        if (clienteExistente.length > 0) {
            id_cliente = clienteExistente[0].id_cliente;
            datosCliente = {
                nombre: clienteExistente[0].nombre,
                apellido: clienteExistente[0].apellido,
                dpi: clienteExistente[0].dpi,
                telefono: clienteExistente[0].telefono || '',
                correo: clienteExistente[0].correo || '',
                direccion: clienteExistente[0].direccion || '',
                existe: true
            };
            id_usuario = clienteExistente[0].id_usuario;
        } else {
            if (!nombre || !apellido) throw new Error('Nombre y apellido son requeridos para cliente nuevo');
            
            // Generar nombre de usuario único basado en nombre y apellido
            nombre_usuario = `${nombre.toLowerCase()}${apellido.toLowerCase()}`.replace(/ /g, '');
            let contador = 1;
            let nombreUsuarioTemp = nombre_usuario;
            
            // Verificar que el nombre de usuario no exista
            let [usuarioExistente] = await connection.query(
                'SELECT id_usuario FROM usuario WHERE nombre_usuario = $1',
                [nombreUsuarioTemp]
            );
            
            while (usuarioExistente.length > 0) {
                nombreUsuarioTemp = `${nombre_usuario}${contador}`;
                [usuarioExistente] = await connection.query(
                    'SELECT id_usuario FROM usuario WHERE nombre_usuario = $1',
                    [nombreUsuarioTemp]
                );
                contador++;
            }
            nombre_usuario = nombreUsuarioTemp;
            
            // Crear contraseña temporal (el cliente deberá cambiarla después)
            const password_temporal = dpi.slice(-6);
            const salt = await bcrypt.genSalt(10);
            const password_hash = await bcrypt.hash(password_temporal, salt);
            
            // Crear usuario primero
            const [usuario] = await connection.query(
                `INSERT INTO usuario (nombre_usuario, correo, password_hash, id_rol, estado, dpi)
                 VALUES ($1, $2, $3, 4, TRUE, $4)
                 RETURNING id_usuario AS id`,
                [nombre_usuario, correo || `${nombre_usuario}@banco.com`, password_hash, dpi]
            );
            id_usuario = usuario.insertId;
            
            // Luego crear cliente vinculado al usuario
            const [cliente] = await connection.query(
                `INSERT INTO cliente (nombre, apellido, dpi, telefono, correo, direccion, id_usuario, estado, fecha_registro)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, NOW())
                 RETURNING id_cliente AS id`,
                [nombre, apellido, dpi, telefono || null, correo || null, direccion || null, id_usuario]
            );
            id_cliente = cliente.insertId;
            
            // Actualizar usuario con id_cliente
            await connection.query(
                'UPDATE usuario SET id_cliente = $1 WHERE id_usuario = $2',
                [id_cliente, id_usuario]
            );
            
            datosCliente = {
                nombre: nombre,
                apellido: apellido,
                dpi: dpi,
                telefono: telefono || '',
                correo: correo || '',
                direccion: direccion || '',
                existe: false,
                nombre_usuario: nombre_usuario,
                password_temporal: password_temporal
            };
        }
        
        const numero_cuenta = `GT${Date.now()}${Math.floor(Math.random() * 10000)}`;
        
        const [cuenta] = await connection.query(
            `INSERT INTO cuenta (numero_cuenta, id_cliente, id_banco, id_tipo_cuenta, id_moneda, saldo, fecha_apertura, estado)
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, 'ACTIVA')
             RETURNING id_cuenta AS id`,
            [numero_cuenta, id_cliente, id_banco, id_tipo_cuenta, id_moneda, monto_apertura || 0]
        );
        
        if (monto_apertura && monto_apertura > 0) {
            await connection.query(
                `INSERT INTO movimiento (id_cuenta, id_tipo_movimiento, monto, saldo_anterior, saldo_nuevo, descripcion, id_cajero)
                 VALUES ($1, 1, $2, 0, $3, 'Apertura de cuenta en ventanilla', $4)`,
                [cuenta.insertId, monto_apertura, monto_apertura, req.user.id_usuario]
            );
        }
        
        await connection.commit();
        
        // Construir mensaje de respuesta
        let mensaje = `✅ Cuenta creada exitosamente para ${datosCliente.nombre} ${datosCliente.apellido}\n\n`;
        mensaje += `📌 DATOS DEL CLIENTE:\n`;
        mensaje += `• DPI: ${datosCliente.dpi}\n`;
        mensaje += `• Nombre: ${datosCliente.nombre} ${datosCliente.apellido}\n`;
        mensaje += `• Teléfono: ${datosCliente.telefono || 'No registrado'}\n`;
        mensaje += `• Correo: ${datosCliente.correo || 'No registrado'}\n`;
        mensaje += `• Dirección: ${datosCliente.direccion || 'No registrada'}\n\n`;
        
        if (!datosCliente.existe) {
            mensaje += `🔐 DATOS DE ACCESO A LA BANCA:\n`;
            mensaje += `• Usuario: ${datosCliente.nombre_usuario}\n`;
            mensaje += `• Contraseña temporal: ${datosCliente.password_temporal}\n`;
            mensaje += `⚠️ El cliente debe cambiar su contraseña al iniciar sesión.\n\n`;
            mensaje += `📱 Para recibir notificaciones por Telegram:\n`;
            mensaje += `1. Buscar el bot en Telegram\n`;
            mensaje += `2. Enviar: /vincular ${datosCliente.nombre_usuario}\n\n`;
        }
        
        mensaje += `🏦 DATOS DE LA CUENTA:\n`;
        mensaje += `• Número de cuenta: ${numero_cuenta}\n`;
        mensaje += `• Saldo inicial: Q${monto_apertura || 0}\n\n`;
        mensaje += `⚠️ IMPORTANTE: Entregue estos datos al cliente.`;
        
        res.json({
            success: true,
            message: mensaje,
            numero_cuenta: numero_cuenta,
            saldo_inicial: monto_apertura || 0,
            cliente: {
                dpi: datosCliente.dpi,
                nombre: datosCliente.nombre,
                apellido: datosCliente.apellido,
                telefono: datosCliente.telefono,
                correo: datosCliente.correo,
                direccion: datosCliente.direccion,
                existe: datosCliente.existe,
                nombre_usuario: datosCliente.nombre_usuario || null,
                password_temporal: datosCliente.password_temporal || null
            }
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('Error en aperturaCuenta:', error);
        res.status(400).json({ error: error.message });
    } finally {
        connection.release();
    }
};

const misCuentas = async (req, res) => {
    try {
        const id_usuario = req.user.id_usuario;
        const [cuentas] = await db.query(
            `SELECT c.*, b.nombre_banco, tc.nombre_tipo, m.codigo as moneda_codigo
             FROM cuenta c
             JOIN cliente cl ON c.id_cliente = cl.id_cliente
             JOIN banco b ON c.id_banco = b.id_banco
             JOIN tipo_cuenta tc ON c.id_tipo_cuenta = tc.id_tipo_cuenta
             JOIN moneda m ON c.id_moneda = m.id_moneda
             WHERE cl.id_usuario = $1 AND c.estado = 'ACTIVA'`,
            [id_usuario]
        );
        res.json(cuentas);
    } catch (error) {
        console.error('Error en misCuentas:', error);
        res.status(500).json({ error: 'Error al obtener cuentas' });
    }
};

const crearCuentaUsuario = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        
        const { id_banco, id_tipo_cuenta, id_moneda, monto_apertura } = req.body;
        const id_usuario = req.user.id_usuario;
        
        const [clientes] = await connection.query(
            'SELECT id_cliente FROM cliente WHERE id_usuario = $1',
            [id_usuario]
        );
        
        if (clientes.length === 0) {
            throw new Error('No se encontró un cliente asociado a este usuario');
        }
        
        const id_cliente = clientes[0].id_cliente;
        const numero_cuenta = `GT${Date.now()}${Math.floor(Math.random() * 10000)}`;
        
        const [cuenta] = await connection.query(
            `INSERT INTO cuenta (numero_cuenta, id_cliente, id_banco, id_tipo_cuenta, id_moneda, saldo, fecha_apertura, estado)
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, 'ACTIVA')
             RETURNING id_cuenta AS id`,
            [numero_cuenta, id_cliente, id_banco, id_tipo_cuenta, id_moneda, monto_apertura || 0]
        );
        
        if (monto_apertura && monto_apertura > 0) {
            await connection.query(
                `INSERT INTO movimiento (id_cuenta, id_tipo_movimiento, monto, saldo_anterior, saldo_nuevo, descripcion)
                 VALUES ($1, 1, $2, 0, $3, 'Apertura de cuenta en linea')`,
                [cuenta.insertId, monto_apertura, monto_apertura]
            );
        }
        
        await connection.commit();
        res.json({ message: `Cuenta creada exitosamente`, numero_cuenta: numero_cuenta, saldo_inicial: monto_apertura || 0 });
    } catch (error) {
        await connection.rollback();
        console.error('Error en crearCuentaUsuario:', error);
        res.status(500).json({ error: error.message || 'Error al crear cuenta' });
    } finally {
        connection.release();
    }
};

const vincularCuenta = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        
        const { numero_cuenta, dpi } = req.body;
        const id_usuario = req.user.id_usuario;
        
        const [cuentas] = await connection.query(
            `SELECT c.*, cl.id_cliente, cl.id_usuario as cliente_usuario, cl.dpi as cliente_dpi
             FROM cuenta c
             JOIN cliente cl ON c.id_cliente = cl.id_cliente
             WHERE c.numero_cuenta = $1 AND c.estado = 'ACTIVA'`,
            [numero_cuenta]
        );
        
        if (cuentas.length === 0) {
            throw new Error('Número de cuenta no válido o inactivo');
        }
        
        const cuenta = cuentas[0];
        
        if (cuenta.cliente_dpi !== dpi) {
            throw new Error('El DPI no coincide con el titular de la cuenta');
        }
        
        if (cuenta.cliente_usuario) {
            throw new Error('Esta cuenta ya está vinculada a otro usuario');
        }
        
        await connection.query(
            'UPDATE cliente SET id_usuario = $1 WHERE id_cliente = $2',
            [id_usuario, cuenta.id_cliente]
        );
        
        await connection.query(
            'UPDATE usuario SET id_cliente = $1 WHERE id_usuario = $2',
            [cuenta.id_cliente, id_usuario]
        );
        
        await connection.commit();
        
        res.json({ 
            message: `Cuenta ${numero_cuenta} vinculada exitosamente`,
            cuenta: {
                numero: cuenta.numero_cuenta,
                saldo: cuenta.saldo
            }
        });
        
    } catch (error) {
        await connection.rollback();
        res.status(400).json({ error: error.message });
    } finally {
        connection.release();
    }
};

module.exports = {
    getResumenDia,
    realizarDeposito,
    realizarRetiro,
    aperturaCuenta,
    misCuentas,
    crearCuentaUsuario,
    vincularCuenta
};

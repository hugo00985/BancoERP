const db = require('../config/db');

const crearCuenta = async (req, res) => {
    try {
        const { id_cliente, id_banco, id_tipo_cuenta, id_moneda, saldo_inicial } = req.body;
        
        const numero_cuenta = `GT${Date.now()}${Math.floor(Math.random() * 1000)}`;
        
        const [result] = await db.query(
            `INSERT INTO cuenta (numero_cuenta, id_cliente, id_banco, id_tipo_cuenta, id_moneda, saldo, fecha_apertura)
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE)
             RETURNING id_cuenta AS id`,
            [numero_cuenta, id_cliente, id_banco, id_tipo_cuenta, id_moneda, saldo_inicial || 0]
        );
        
        if (saldo_inicial && saldo_inicial > 0) {
            await db.query(
                `INSERT INTO movimiento (id_cuenta, id_tipo_movimiento, monto, saldo_anterior, saldo_nuevo, descripcion)
                 VALUES ($1, 1, $2, 0, $3, 'Apertura de cuenta')`,
                [result.insertId, saldo_inicial, saldo_inicial]
            );
        }
        
        res.status(201).json({ message: 'Cuenta creada exitosamente', id_cuenta: result.insertId, numero_cuenta });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al crear cuenta' });
    }
};

const getCuentasByCliente = async (req, res) => {
    try {
        const { id_cliente } = req.params;
        const [cuentas] = await db.query(
            `SELECT c.*, b.nombre_banco, tc.nombre_tipo, m.codigo as moneda_codigo
             FROM cuenta c
             JOIN banco b ON c.id_banco = b.id_banco
             JOIN tipo_cuenta tc ON c.id_tipo_cuenta = tc.id_tipo_cuenta
             JOIN moneda m ON c.id_moneda = m.id_moneda
             WHERE c.id_cliente = $1 AND c.estado = 'ACTIVA'`,
            [id_cliente]
        );
        res.json(cuentas);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener cuentas' });
    }
};

const getMovimientos = async (req, res) => {
    try {
        const { id_cuenta } = req.params;
        const [movimientos] = await db.query(
            `SELECT m.*, tm.nombre_tipo, tm.signo
             FROM movimiento m
             JOIN tipo_movimiento tm ON m.id_tipo_movimiento = tm.id_tipo_movimiento
             WHERE m.id_cuenta = $1
             ORDER BY m.fecha_movimiento DESC
             LIMIT 50`,
            [id_cuenta]
        );
        res.json(movimientos);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener movimientos' });
    }
};

module.exports = { crearCuenta, getCuentasByCliente, getMovimientos };

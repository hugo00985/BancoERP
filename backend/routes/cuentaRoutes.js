const express = require('express');
const { crearCuenta, getCuentasByCliente, getMovimientos } = require('../controllers/cuentaController');
const { authenticateToken, authorize } = require('../middleware/auth');
const db = require('../config/db');
const router = express.Router();

router.post('/', authenticateToken, authorize('ADMIN', 'GERENTE'), crearCuenta);
router.get('/cliente/:id_cliente', authenticateToken, getCuentasByCliente);
router.get('/:id_cuenta/movimientos', authenticateToken, getMovimientos);

// Buscar cuenta por número de cuenta o DPI (CORREGIDO)
router.get('/buscar/:valor', authenticateToken, authorize('CAJERO', 'ADMIN'), async (req, res) => {
    try {
        const { valor } = req.params;
        let cuentas;
        
        if (valor.startsWith('GT')) {
            // Buscar por número de cuenta
            [cuentas] = await db.query(
                `SELECT c.*, b.nombre_banco, tc.nombre_tipo, m.codigo as moneda_codigo,
                        cl.nombre, cl.apellido, cl.dpi, cl.telefono, cl.correo
                 FROM cuenta c
                 JOIN banco b ON c.id_banco = b.id_banco
                 JOIN tipo_cuenta tc ON c.id_tipo_cuenta = tc.id_tipo_cuenta
                 JOIN moneda m ON c.id_moneda = m.id_moneda
                 JOIN cliente cl ON c.id_cliente = cl.id_cliente
                 WHERE c.numero_cuenta = $1 AND c.estado = 'ACTIVA'`,
                [valor]
            );
        } else {
            // Buscar por DPI del cliente
            [cuentas] = await db.query(
                `SELECT c.*, b.nombre_banco, tc.nombre_tipo, m.codigo as moneda_codigo,
                        cl.nombre, cl.apellido, cl.dpi, cl.telefono, cl.correo
                 FROM cuenta c
                 JOIN banco b ON c.id_banco = b.id_banco
                 JOIN tipo_cuenta tc ON c.id_tipo_cuenta = tc.id_tipo_cuenta
                 JOIN moneda m ON c.id_moneda = m.id_moneda
                 JOIN cliente cl ON c.id_cliente = cl.id_cliente
                 WHERE cl.dpi = $1 AND c.estado = 'ACTIVA'`,
                [valor]
            );
        }
        
        if (cuentas.length === 0) {
            return res.status(404).json({ error: 'Cuenta no encontrada' });
        }
        
        // Devolver la primera cuenta encontrada
        res.json(cuentas[0]);
    } catch (error) {
        console.error('Error al buscar cuenta:', error);
        res.status(500).json({ error: 'Error al buscar cuenta' });
    }
});

// Obtener estado de cuenta completo
router.get('/estado/:numero_cuenta', authenticateToken, authorize('CAJERO', 'ADMIN'), async (req, res) => {
    try {
        const { numero_cuenta } = req.params;
        
        const [cuentas] = await db.query(
            `SELECT c.*, cl.nombre, cl.apellido, cl.dpi, cl.telefono, cl.correo
             FROM cuenta c
             JOIN cliente cl ON c.id_cliente = cl.id_cliente
             WHERE c.numero_cuenta = $1 AND c.estado = 'ACTIVA'`,
            [numero_cuenta]
        );
        
        if (cuentas.length === 0) {
            return res.status(404).json({ error: 'Cuenta no encontrada' });
        }
        
        const cuenta = cuentas[0];
        
        const [movimientos] = await db.query(
            `SELECT m.*, tm.nombre_tipo, tm.signo
             FROM movimiento m
             JOIN tipo_movimiento tm ON m.id_tipo_movimiento = tm.id_tipo_movimiento
             WHERE m.id_cuenta = $1
             ORDER BY m.fecha_movimiento DESC
             LIMIT 50`,
            [cuenta.id_cuenta]
        );
        
        res.json({
            numero_cuenta: cuenta.numero_cuenta,
            saldo: cuenta.saldo,
            titular: `${cuenta.nombre} ${cuenta.apellido}`,
            dpi: cuenta.dpi,
            telefono: cuenta.telefono || '',
            correo: cuenta.correo || '',
            movimientos: movimientos
        });
    } catch (error) {
        console.error('Error al obtener estado de cuenta:', error);
        res.status(500).json({ error: 'Error al obtener estado de cuenta' });
    }
});

// Buscar cliente por DPI
router.get('/cliente/buscar/:dpi', authenticateToken, authorize('CAJERO', 'ADMIN'), async (req, res) => {
    try {
        const [clientes] = await db.query(
            `SELECT id_cliente, nombre, apellido, dpi, fecha_nacimiento, telefono, correo, direccion 
             FROM cliente 
             WHERE dpi = $1 AND estado = TRUE`,
            [req.params.dpi]
        );
        
        if (clientes.length === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }
        
        res.json(clientes[0]);
    } catch (error) {
        console.error('Error al buscar cliente:', error);
        res.status(500).json({ error: 'Error al buscar cliente' });
    }
});

// Listar todas las cuentas (para cajero/admin)
router.get('/listar/todas', authenticateToken, authorize('CAJERO', 'ADMIN'), async (req, res) => {
    try {
        const [cuentas] = await db.query(
            `SELECT c.id_cuenta, c.numero_cuenta, c.saldo, c.estado, c.fecha_apertura,
                    b.nombre_banco, tc.nombre_tipo, m.codigo as moneda,
                    cl.nombre, cl.apellido, cl.dpi
             FROM cuenta c
             JOIN banco b ON c.id_banco = b.id_banco
             JOIN tipo_cuenta tc ON c.id_tipo_cuenta = tc.id_tipo_cuenta
             JOIN moneda m ON c.id_moneda = m.id_moneda
             JOIN cliente cl ON c.id_cliente = cl.id_cliente
             ORDER BY c.id_cuenta DESC
             LIMIT 100`
        );
        res.json(cuentas);
    } catch (error) {
        console.error('Error al listar cuentas:', error);
        res.status(500).json({ error: 'Error al listar cuentas' });
    }
});

module.exports = router;

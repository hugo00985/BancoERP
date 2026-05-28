const express = require('express');
const { authenticateToken, authorize } = require('../middleware/auth');
const {
    getResumenDia,
    realizarDeposito,
    realizarRetiro,
    aperturaCuenta,
    misCuentas,
    crearCuentaUsuario,
    vincularCuenta
} = require('../controllers/operacionesController');

const router = express.Router();

// Cliente
router.get('/mis-cuentas', authenticateToken, misCuentas);
router.post('/crear-cuenta-usuario', authenticateToken, crearCuentaUsuario);
router.post('/vincular-cuenta', authenticateToken, vincularCuenta);

// Cajero/Admin
router.get('/resumen-dia', authenticateToken, authorize('CAJERO', 'ADMIN'), getResumenDia);
router.post('/deposito', authenticateToken, authorize('CAJERO', 'ADMIN'), realizarDeposito);
router.post('/retiro', authenticateToken, authorize('CAJERO', 'ADMIN'), realizarRetiro);
router.post('/apertura-cuenta', authenticateToken, authorize('CAJERO', 'ADMIN'), aperturaCuenta);

module.exports = router;
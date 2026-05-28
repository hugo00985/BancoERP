const express = require('express');
const {
    comprobante,
    entrante,
    historial,
    listarBancos,
    transferir,
    validarCuenta
} = require('../controllers/interbancariaController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.get('/bancos', authenticateToken, listarBancos);
router.get('/historial', authenticateToken, historial);
router.get('/comprobante/:referencia', authenticateToken, comprobante);
router.post('/validar-cuenta', authenticateToken, validarCuenta);
router.post('/transferir', authenticateToken, transferir);
router.post('/entrante', entrante);

module.exports = router;

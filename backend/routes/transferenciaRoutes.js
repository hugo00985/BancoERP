const express = require('express');
const { realizarTransferencia, getHistorialTransferencias } = require('../controllers/transferenciaController');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

router.post('/', authenticateToken, realizarTransferencia);
router.get('/cuenta/:id_cuenta/historial', authenticateToken, getHistorialTransferencias);

module.exports = router;
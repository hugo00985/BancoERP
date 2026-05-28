const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const {
    getEstadoVinculacion,
    probarTelegram,
    vincularTelegram
} = require('../controllers/telegramController');
const router = express.Router();

router.post('/vincular', authenticateToken, vincularTelegram);
router.get('/estado', authenticateToken, getEstadoVinculacion);
router.post('/probar', authenticateToken, probarTelegram);

module.exports = router;

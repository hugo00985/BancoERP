const express = require('express');
const { login, register, getProfile, cambiarPassword } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

router.post('/login', login);
router.post('/register', register);
router.get('/profile', authenticateToken, getProfile);
router.post('/cambiar-password', cambiarPassword);

module.exports = router;
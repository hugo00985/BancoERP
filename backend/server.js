const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const { connectMongo } = require('./config/mongodb');
const { setupSwagger } = require('./config/swagger');
const { initBot } = require('./services/telegramService');
const { auditarErrorCritico } = require('./middleware/auditoria');
const { registrarEventoAuditoria } = require('./services/auditoriaService');

dotenv.config();

// Importar rutas
const adminRoutes = require('./routes/adminRoutes');
const authRoutes = require('./routes/authRoutes');
const cuentaRoutes = require('./routes/cuentaRoutes');
const transferenciaRoutes = require('./routes/transferenciaRoutes');
const operacionesRoutes = require('./routes/operacionesRoutes');
const apiExternaRoutes = require('./routes/apiExternaRoutes');
const telegramRoutes = require('./routes/telegramRoutes');
const interbancariaRoutes = require('./routes/interbancariaRoutes');

const app = express();

// Middlewares
app.set('trust proxy', 1);
app.use(helmet({
    contentSecurityPolicy: false
}));

const corsOrigins = String(process.env.CORS_ORIGIN || '').split(',').map(origin => origin.trim()).filter(Boolean);
app.use(cors({
    origin(origin, callback) {
        if (!origin || corsOrigins.length === 0 || corsOrigins.includes('*') || corsOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error('Origen no permitido por CORS'));
    },
    credentials: true
}));

const generalLimiter = rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    max: Number(process.env.RATE_LIMIT_MAX || 300),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes. Intenta nuevamente mas tarde.' }
});

const loginLimiter = rateLimit({
    windowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    max: Number(process.env.LOGIN_RATE_LIMIT_MAX || 10),
    standardHeaders: true,
    legacyHeaders: false,
    handler(req, res) {
        registrarEventoAuditoria({
            req,
            accion: 'LOGIN_RATE_LIMIT',
            modulo: 'SEGURIDAD',
            descripcion: 'Limite de intentos de login por IP excedido',
            estado: 'DENEGADO',
            metadata: { path: req.originalUrl }
        }).catch(() => {});
        res.status(429).json({ error: 'Demasiados intentos de login. Intenta nuevamente mas tarde.' });
    }
});

app.use('/api', generalLimiter);
app.use('/api/auth/login', loginLimiter);
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));
app.use(morgan('dev'));
setupSwagger(app);
app.use(express.static(path.join(__dirname, '../frontend')));

// Conectar MongoDB e inicializar Telegram
(async () => {
    await connectMongo();
    initBot();
})();

// Rutas API
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/cuentas', cuentaRoutes);
app.use('/api/transferencias', transferenciaRoutes);
app.use('/api/operaciones', operacionesRoutes);
app.use('/api/externa', apiExternaRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/interbancaria', interbancariaRoutes);

// Ruta de salud
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date() });
});

app.use((error, req, res, next) => {
    if (error.type === 'entity.too.large') {
        registrarEventoAuditoria({
            req,
            accion: 'PAYLOAD_GRANDE',
            modulo: 'SEGURIDAD',
            descripcion: 'Payload excede el limite permitido',
            estado: 'DENEGADO',
            metadata: { limit: process.env.JSON_BODY_LIMIT || '1mb' }
        }).catch(() => {});
        return res.status(413).json({ error: 'Payload demasiado grande' });
    }

    if (error.message === 'Origen no permitido por CORS') {
        registrarEventoAuditoria({
            req,
            accion: 'CORS_DENEGADO',
            modulo: 'SEGURIDAD',
            descripcion: 'Solicitud bloqueada por CORS',
            estado: 'DENEGADO',
            metadata: { origin: req.headers.origin }
        }).catch(() => {});
        return res.status(403).json({ error: 'Origen no permitido por CORS' });
    }

    auditarErrorCritico(error, req).catch(() => {});
    res.status(500).json({
        error: process.env.NODE_ENV === 'production'
            ? 'Error interno del servidor'
            : error.message
    });
});

// Redirigir al index.html del frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});

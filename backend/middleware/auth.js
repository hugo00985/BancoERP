const jwt = require('jsonwebtoken');
const { auditarAccesoDenegado } = require('./auditoria');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Acceso denegado. Token requerido' });
    }

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET || 'mi_secreto_temporal');
        req.user = verified;
        next();
    } catch (error) {
        res.status(403).json({ error: 'Token invalido o expirado' });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.rol)) {
            auditarAccesoDenegado(req, roles).catch(() => {});
            return res.status(403).json({ error: 'No tienes permiso para esta accion' });
        }
        next();
    };
};

module.exports = { authenticateToken, authorize };

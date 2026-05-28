const db = require('../config/db');

const auditLog = async (req, res, next) => {
    const originalSend = res.send;
    
    res.send = function(data) {
        if (['POST', 'PUT', 'DELETE'].includes(req.method) && req.user) {
            const action = req.method === 'POST' ? 'CREATE' : (req.method === 'PUT' ? 'UPDATE' : 'DELETE');
            
            db.query(
                `INSERT INTO auditoria (id_usuario, id_tipo_accion, tabla_afectada, detalle, ip_origen, user_agent)
                 VALUES ($1, (SELECT id_tipo_accion FROM tipo_accion WHERE codigo = $2), $3, $4, $5, $6)`,
                [req.user.id_usuario, action, req.baseUrl, JSON.stringify(req.body), req.ip, req.headers['user-agent']]
            ).catch(err => console.error('Error en auditoría:', err));
        }
        originalSend.call(this, data);
    };
    
    next();
};

module.exports = auditLog;

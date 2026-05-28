const db = require('../config/db');
const {
    obtenerVinculoPorUsuarioId,
    vincularUsuarioTelegram
} = require('../models/telegramModel');
const {
    enviarNotificacionPrueba
} = require('../services/telegramService');
const { registrarEventoAuditoria } = require('../services/auditoriaService');

async function getUsuarioActual(req) {
    const [users] = await db.query(
        `SELECT id_usuario, nombre_usuario
         FROM usuario
         WHERE id_usuario = $1 AND estado = TRUE
         LIMIT 1`,
        [req.user.id_usuario]
    );

    return users[0] || null;
}

async function vincularTelegram(req, res) {
    try {
        const chat_id = req.body.chat_id || req.body.chatId;

        if (!chat_id) {
            return res.status(400).json({ success: false, error: 'chat_id es requerido' });
        }

        const usuario = await getUsuarioActual(req);

        if (!usuario) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }

        const result = await vincularUsuarioTelegram({
            id_usuario: usuario.id_usuario,
            username: usuario.nombre_usuario,
            chat_id
        });

        if (!result) {
            await registrarEventoAuditoria({
                req,
                accion: 'VINCULACION_TELEGRAM',
                modulo: 'TELEGRAM',
                descripcion: 'MongoDB no disponible para vincular Telegram',
                estado: 'ERROR',
                metadata: { chat_id }
            });
            return res.status(503).json({
                success: false,
                error: 'MongoDB no esta disponible para vincular Telegram'
            });
        }

        await registrarEventoAuditoria({
            req,
            accion: 'VINCULACION_TELEGRAM',
            modulo: 'TELEGRAM',
            descripcion: 'Usuario vinculo Telegram',
            estado: 'OK',
            metadata: { chat_id, username: usuario.nombre_usuario }
        });

        res.json({
            success: true,
            message: 'Cuenta de Telegram vinculada exitosamente',
            vinculado: true,
            username: usuario.nombre_usuario
        });
    } catch (error) {
        console.error('[Telegram] error:', error.message);
        await registrarEventoAuditoria({
            req,
            accion: 'VINCULACION_TELEGRAM',
            modulo: 'TELEGRAM',
            descripcion: 'Error al vincular Telegram',
            estado: 'ERROR',
            metadata: { error: error.message }
        });
        res.status(500).json({ success: false, error: 'Error al vincular Telegram' });
    }
}

async function getEstadoVinculacion(req, res) {
    try {
        const usuario = await getUsuarioActual(req);

        if (!usuario) {
            return res.json({ success: true, vinculado: false });
        }

        const vinculo = await obtenerVinculoPorUsuarioId(usuario.id_usuario);

        res.json({
            success: true,
            vinculado: Boolean(vinculo),
            username: usuario.nombre_usuario,
            chat_id: vinculo?.chat_id || null,
            activo: Boolean(vinculo?.activo),
            fecha_vinculacion: vinculo?.fecha_vinculacion || null
        });
    } catch (error) {
        console.error('[Telegram] error:', error.message);
        res.status(500).json({ success: false, error: 'Error al consultar estado de Telegram' });
    }
}

async function probarTelegram(req, res) {
    try {
        const usuario = await getUsuarioActual(req);

        if (!usuario) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }

        const result = await enviarNotificacionPrueba(usuario.id_usuario, usuario.nombre_usuario);

        if (!result.enviado) {
            await registrarEventoAuditoria({
                req,
                accion: 'PRUEBA_TELEGRAM',
                modulo: 'TELEGRAM',
                descripcion: 'Prueba de Telegram fallida',
                estado: 'FALLIDO',
                metadata: { error: result.error }
            });
            return res.status(400).json({
                success: false,
                enviado: false,
                error: result.error || 'No se pudo enviar mensaje de prueba'
            });
        }

        await registrarEventoAuditoria({
            req,
            accion: 'PRUEBA_TELEGRAM',
            modulo: 'TELEGRAM',
            descripcion: 'Prueba de Telegram enviada',
            estado: 'OK',
            metadata: { username: usuario.nombre_usuario }
        });

        res.json({
            success: true,
            enviado: true,
            message: 'Mensaje de prueba enviado correctamente'
        });
    } catch (error) {
        console.error('[Telegram] error:', error.message);
        await registrarEventoAuditoria({
            req,
            accion: 'PRUEBA_TELEGRAM',
            modulo: 'TELEGRAM',
            descripcion: 'Error al probar Telegram',
            estado: 'ERROR',
            metadata: { error: error.message }
        });
        res.status(500).json({ success: false, error: 'Error al probar Telegram' });
    }
}

module.exports = {
    getEstadoVinculacion,
    probarTelegram,
    vincularTelegram
};

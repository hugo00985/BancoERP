const { getMongoDb } = require('../config/mongodb');

const COLLECTIONS = {
    usuarios: 'usuarios_telegram',
    notificaciones: 'notificaciones_telegram',
    logs: 'logs_telegram'
};

async function collection(name) {
    const db = await getMongoDb();
    return db ? db.collection(name) : null;
}

async function registrarLogTelegram(evento, data = {}) {
    try {
        const logs = await collection(COLLECTIONS.logs);
        if (!logs) return null;

        return logs.insertOne({
            evento,
            ...data,
            fecha: new Date()
        });
    } catch (error) {
        console.error('[Telegram] error registrando log:', error.message);
        return null;
    }
}

async function vincularUsuarioTelegram({ id_usuario, username, chat_id, nombre_telegram = null }) {
    const usuarios = await collection(COLLECTIONS.usuarios);
    if (!usuarios) {
        await registrarLogTelegram('mongo_no_disponible', { id_usuario, username });
        return null;
    }

    const payload = {
        id_usuario: Number(id_usuario),
        username,
        chat_id: String(chat_id),
        nombre_telegram,
        activo: true,
        fecha_vinculacion: new Date(),
        fecha_actualizacion: new Date()
    };

    const result = await usuarios.updateOne(
        { id_usuario: Number(id_usuario) },
        {
            $set: payload,
            $setOnInsert: { fecha_creacion: new Date() }
        },
        { upsert: true }
    );

    console.log('[Telegram] usuario vinculado', {
        id_usuario: payload.id_usuario,
        username: payload.username,
        chat_id: payload.chat_id
    });

    await registrarLogTelegram('usuario_vinculado', {
        id_usuario: payload.id_usuario,
        username: payload.username,
        chat_id: payload.chat_id
    });

    return result;
}

async function obtenerVinculoPorUsuarioId(id_usuario) {
    const usuarios = await collection(COLLECTIONS.usuarios);
    if (!usuarios) return null;

    return usuarios.findOne({
        id_usuario: Number(id_usuario),
        activo: true
    });
}

async function obtenerVinculoPorUsername(username) {
    const usuarios = await collection(COLLECTIONS.usuarios);
    if (!usuarios) return null;

    return usuarios.findOne({
        username,
        activo: true
    });
}

async function obtenerVinculoPorChatId(chatId) {
    const usuarios = await collection(COLLECTIONS.usuarios);
    if (!usuarios) return null;

    return usuarios.findOne({
        chat_id: String(chatId),
        activo: true
    });
}

async function desactivarNotificaciones(usuarioOrId) {
    const usuarios = await collection(COLLECTIONS.usuarios);
    if (!usuarios) return null;

    const query = Number.isFinite(Number(usuarioOrId))
        ? { id_usuario: Number(usuarioOrId) }
        : { username: String(usuarioOrId) };

    return usuarios.updateOne(query, {
        $set: {
            activo: false,
            fecha_actualizacion: new Date()
        }
    });
}

async function registrarIntentoNotificacion({
    id_usuario,
    username,
    tipo,
    mensaje,
    enviado,
    error = null,
    chat_id = null,
    metadata = {}
}) {
    try {
        const notificaciones = await collection(COLLECTIONS.notificaciones);
        if (!notificaciones) return null;

        return notificaciones.insertOne({
            id_usuario: id_usuario ? Number(id_usuario) : null,
            username: username || null,
            tipo,
            mensaje,
            enviado: Boolean(enviado),
            error: error || null,
            chat_id: chat_id ? String(chat_id) : null,
            metadata,
            fecha: new Date()
        });
    } catch (insertError) {
        console.error('[Telegram] error registrando notificacion:', insertError.message);
        return null;
    }
}

async function saveChatId(usuario, chatId, nombreUsuario = null) {
    const usuarios = await collection(COLLECTIONS.usuarios);
    if (!usuarios) return null;

    return usuarios.updateOne(
        { username: usuario },
        {
            $set: {
                username: usuario,
                chat_id: String(chatId),
                nombre_telegram: nombreUsuario,
                fecha_vinculacion: new Date(),
                fecha_actualizacion: new Date(),
                activo: true
            },
            $setOnInsert: { fecha_creacion: new Date() }
        },
        { upsert: true }
    );
}

async function getChatIdByUsuario(usuarioOrId) {
    const vinculo = Number.isFinite(Number(usuarioOrId))
        ? await obtenerVinculoPorUsuarioId(usuarioOrId)
        : await obtenerVinculoPorUsername(usuarioOrId);

    return vinculo ? vinculo.chat_id : null;
}

async function getUsuarioByChatId(chatId) {
    const vinculo = await obtenerVinculoPorChatId(chatId);
    return vinculo ? vinculo.username : null;
}

module.exports = {
    COLLECTIONS,
    desactivarNotificaciones,
    getChatIdByUsuario,
    getUsuarioByChatId,
    obtenerVinculoPorChatId,
    obtenerVinculoPorUsuarioId,
    obtenerVinculoPorUsername,
    registrarIntentoNotificacion,
    registrarLogTelegram,
    saveChatId,
    vincularUsuarioTelegram
};

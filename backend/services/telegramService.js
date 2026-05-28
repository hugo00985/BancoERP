const TelegramBot = require('node-telegram-bot-api');
const db = require('../config/db');
const {
    desactivarNotificaciones,
    obtenerVinculoPorChatId,
    obtenerVinculoPorUsuarioId,
    obtenerVinculoPorUsername,
    registrarIntentoNotificacion,
    registrarLogTelegram,
    vincularUsuarioTelegram
} = require('../models/telegramModel');

let bot = null;
let initialized = false;

function hasValidToken() {
    const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();

    return token
        && !token.includes('aqui_va_tu_token')
        && !token.toLowerCase().includes('your_token');
}

function getBot({ polling = false } = {}) {
    if (!hasValidToken()) {
        return null;
    }

    if (bot) {
        return bot;
    }

    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling });
    return bot;
}

function formatAmount(value) {
    const amount = Number(value || 0);

    return `Q${amount.toFixed(2)}`;
}

function buildDisplayName(from = {}) {
    return [from.first_name, from.last_name].filter(Boolean).join(' ').trim() || from.username || null;
}

async function buscarUsuarioPorUsername(username) {
    if (!username) return null;

    try {
        const [usuarios] = await db.query(
            `SELECT id_usuario, nombre_usuario
             FROM usuario
             WHERE nombre_usuario = $1 AND estado = TRUE
             LIMIT 1`,
            [username]
        );

        return usuarios[0] || null;
    } catch (error) {
        console.error('[Telegram] error:', error.message);
        return null;
    }
}

async function buscarUsuarioPorId(idUsuario) {
    if (!idUsuario) return null;

    try {
        const [usuarios] = await db.query(
            `SELECT id_usuario, nombre_usuario
             FROM usuario
             WHERE id_usuario = $1 AND estado = TRUE
             LIMIT 1`,
            [idUsuario]
        );

        return usuarios[0] || null;
    } catch (error) {
        console.error('[Telegram] error:', error.message);
        return null;
    }
}

async function resolveVinculo({ id_usuario, username }) {
    if (id_usuario) {
        const vinculoPorId = await obtenerVinculoPorUsuarioId(id_usuario);
        if (vinculoPorId) return vinculoPorId;
    }

    if (username) {
        const vinculoPorUsername = await obtenerVinculoPorUsername(username);
        if (vinculoPorUsername) return vinculoPorUsername;
    }

    return null;
}

async function registrarIntentoSeguro(payload) {
    try {
        await registrarIntentoNotificacion(payload);
    } catch (error) {
        console.error('[Telegram] error:', error.message);
    }
}

async function enviarNotificacion({
    id_usuario = null,
    username = null,
    tipo = 'GENERAL',
    mensaje,
    metadata = {}
}) {
    const texto = String(mensaje || '').trim();

    try {
        let resolvedId = id_usuario ? Number(id_usuario) : null;
        let resolvedUsername = username || null;

        if (!resolvedId && resolvedUsername) {
            const usuario = await buscarUsuarioPorUsername(resolvedUsername);
            resolvedId = usuario?.id_usuario || null;
            resolvedUsername = usuario?.nombre_usuario || resolvedUsername;
        }

        if (resolvedId && !resolvedUsername) {
            const usuario = await buscarUsuarioPorId(resolvedId);
            resolvedUsername = usuario?.nombre_usuario || null;
        }

        const vinculo = await resolveVinculo({ id_usuario: resolvedId, username: resolvedUsername });

        if (!vinculo) {
            await registrarIntentoSeguro({
                id_usuario: resolvedId,
                username: resolvedUsername,
                tipo,
                mensaje: texto,
                enviado: false,
                error: 'Usuario sin Telegram vinculado',
                metadata
            });

            return { enviado: false, error: 'Usuario sin Telegram vinculado' };
        }

        const telegramBot = getBot();

        if (!telegramBot) {
            await registrarIntentoSeguro({
                id_usuario: vinculo.id_usuario || resolvedId,
                username: vinculo.username || resolvedUsername,
                tipo,
                mensaje: texto,
                enviado: false,
                error: 'TELEGRAM_BOT_TOKEN no configurado',
                chat_id: vinculo.chat_id,
                metadata
            });

            return { enviado: false, error: 'TELEGRAM_BOT_TOKEN no configurado' };
        }

        await telegramBot.sendMessage(vinculo.chat_id, texto);
        console.log('[Telegram] notificación enviada', {
            id_usuario: vinculo.id_usuario || resolvedId,
            tipo
        });

        await registrarIntentoSeguro({
            id_usuario: vinculo.id_usuario || resolvedId,
            username: vinculo.username || resolvedUsername,
            tipo,
            mensaje: texto,
            enviado: true,
            error: null,
            chat_id: vinculo.chat_id,
            metadata
        });

        return { enviado: true };
    } catch (error) {
        console.error('[Telegram] error:', error.message);

        await registrarIntentoSeguro({
            id_usuario,
            username,
            tipo,
            mensaje: texto,
            enviado: false,
            error: error.message,
            metadata
        });

        return { enviado: false, error: error.message };
    }
}

async function enviarNotificacionPrueba(idUsuario, username = null) {
    return enviarNotificacion({
        id_usuario: idUsuario,
        username,
        tipo: 'PRUEBA',
        mensaje: [
            'Banco Industrial',
            'Notificacion de prueba',
            '',
            'Tu cuenta de Telegram esta vinculada correctamente.'
        ].join('\n')
    });
}

async function notificarDeposito(username, numeroCuenta, monto, saldoNuevo) {
    return enviarNotificacion({
        username,
        tipo: 'DEPOSITO',
        mensaje: [
            'Banco Industrial',
            'Deposito confirmado',
            '',
            `Cuenta: ${numeroCuenta}`,
            `Monto: ${formatAmount(monto)}`,
            `Saldo disponible: ${formatAmount(saldoNuevo)}`
        ].join('\n'),
        metadata: { numeroCuenta, monto, saldoNuevo }
    });
}

async function notificarRetiro(username, numeroCuenta, monto, saldoNuevo) {
    return enviarNotificacion({
        username,
        tipo: 'RETIRO',
        mensaje: [
            'Banco Industrial',
            'Retiro confirmado',
            '',
            `Cuenta: ${numeroCuenta}`,
            `Monto: ${formatAmount(monto)}`,
            `Saldo disponible: ${formatAmount(saldoNuevo)}`
        ].join('\n'),
        metadata: { numeroCuenta, monto, saldoNuevo }
    });
}

async function notificarTransferencia(username, cuentaOrigen, cuentaDestino, monto, saldoNuevo) {
    return enviarNotificacion({
        username,
        tipo: 'TRANSFERENCIA_LOCAL_ENVIADA',
        mensaje: [
            'Banco Industrial',
            'Transferencia local confirmada',
            '',
            `Cuenta origen: ${cuentaOrigen}`,
            `Cuenta destino: ${cuentaDestino}`,
            `Monto: ${formatAmount(monto)}`,
            `Saldo disponible: ${formatAmount(saldoNuevo)}`
        ].join('\n'),
        metadata: { cuentaOrigen, cuentaDestino, monto, saldoNuevo }
    });
}

async function notificarTransferenciaRecibida(username, cuentaOrigen, cuentaDestino, monto, saldoNuevo) {
    return enviarNotificacion({
        username,
        tipo: 'TRANSFERENCIA_LOCAL_RECIBIDA',
        mensaje: [
            'Banco Industrial',
            'Transferencia local recibida',
            '',
            `Cuenta origen: ${cuentaOrigen}`,
            `Cuenta destino: ${cuentaDestino}`,
            `Monto: ${formatAmount(monto)}`,
            `Saldo disponible: ${formatAmount(saldoNuevo)}`
        ].join('\n'),
        metadata: { cuentaOrigen, cuentaDestino, monto, saldoNuevo }
    });
}

async function notificarInterbancaria(data = {}) {
    const tipo = data.tipo || 'INTERBANCARIA';
    const esEntrante = String(tipo).toUpperCase().includes('ENTRANTE');
    const titulo = esEntrante
        ? 'Transferencia interbancaria recibida'
        : 'Transferencia interbancaria enviada';

    return enviarNotificacion({
        id_usuario: data.id_usuario,
        username: data.username,
        tipo,
        mensaje: [
            'Banco Industrial',
            titulo,
            '',
            `Estado: ${data.estado || 'CONFIRMADA'}`,
            `Referencia: ${data.referenciaInterna || data.referencia || '-'}`,
            data.referenciaExterna ? `Referencia externa: ${data.referenciaExterna}` : null,
            data.bancoOrigen ? `Banco origen: ${data.bancoOrigen}` : null,
            data.bancoDestino ? `Banco destino: ${data.bancoDestino}` : null,
            `Cuenta origen: ${data.cuentaOrigen || '-'}`,
            `Cuenta destino: ${data.cuentaDestino || '-'}`,
            `Monto: ${formatAmount(data.monto)}`,
            data.saldoNuevo !== undefined ? `Saldo disponible: ${formatAmount(data.saldoNuevo)}` : null,
            data.descripcion ? `Descripcion: ${data.descripcion}` : null
        ].filter(Boolean).join('\n'),
        metadata: data
    });
}

async function handleVincularCommand(msg, match) {
    const chatId = msg.chat.id;
    const username = match?.[1]?.trim();

    if (!username) {
        await bot.sendMessage(chatId, 'Envia /vincular tu_usuario para asociar este chat.');
        return;
    }

    const usuario = await buscarUsuarioPorUsername(username);

    if (!usuario) {
        await bot.sendMessage(chatId, 'No encontre un usuario activo con ese nombre.');
        return;
    }

    await vincularUsuarioTelegram({
        id_usuario: usuario.id_usuario,
        username: usuario.nombre_usuario,
        chat_id: chatId,
        nombre_telegram: buildDisplayName(msg.from)
    });

    await bot.sendMessage(chatId, 'Telegram vinculado correctamente a Banco Industrial.');
}

async function handleDesvincularCommand(msg) {
    const chatId = msg.chat.id;
    const vinculo = await obtenerVinculoPorChatId(chatId);

    if (!vinculo) {
        await bot.sendMessage(chatId, 'Este chat no tiene una vinculacion activa.');
        return;
    }

    await desactivarNotificaciones(vinculo.id_usuario || vinculo.username);
    await registrarLogTelegram('usuario_desvinculado', {
        id_usuario: vinculo.id_usuario || null,
        username: vinculo.username || null,
        chat_id: String(chatId)
    });
    await bot.sendMessage(chatId, 'Notificaciones de Telegram desactivadas.');
}

function initBot() {
    try {
        if (!hasValidToken()) {
            console.log('[Telegram] Bot no iniciado: TELEGRAM_BOT_TOKEN no configurado');
            return null;
        }

        if (initialized) {
            return bot;
        }

        bot = getBot({ polling: true });
        initialized = true;

        const botUsername = process.env.TELEGRAM_BOT_USERNAME
            ? ` (@${process.env.TELEGRAM_BOT_USERNAME})`
            : '';

        console.log(`[Telegram] Bot iniciado${botUsername}`);

        bot.onText(/^\/start/i, async (msg) => {
            await bot.sendMessage(
                msg.chat.id,
                'Bienvenido a Banco Industrial. Usa /vincular tu_usuario para activar notificaciones.'
            );
        });

        bot.onText(/^\/vincular(?:\s+(.+))?$/i, async (msg, match) => {
            try {
                await handleVincularCommand(msg, match);
            } catch (error) {
                console.error('[Telegram] error:', error.message);
                await bot.sendMessage(msg.chat.id, 'No pude vincular este chat. Intenta de nuevo.');
            }
        });

        bot.onText(/^\/desvincular/i, async (msg) => {
            try {
                await handleDesvincularCommand(msg);
            } catch (error) {
                console.error('[Telegram] error:', error.message);
                await bot.sendMessage(msg.chat.id, 'No pude desvincular este chat. Intenta de nuevo.');
            }
        });

        bot.on('polling_error', (error) => {
            console.error('[Telegram] error:', error.message);
        });

        return bot;
    } catch (error) {
        console.error('[Telegram] error:', error.message);
        return null;
    }
}

module.exports = {
    enviarNotificacion,
    enviarNotificacionPrueba,
    initBot,
    notificarDeposito,
    notificarInterbancaria,
    notificarRetiro,
    notificarTransferencia,
    notificarTransferenciaRecibida
};

const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { registrarEventoAuditoria } = require('../services/auditoriaService');

async function auditarAuth(req, data) {
    await registrarEventoAuditoria({
        req,
        modulo: 'AUTH',
        ...data
    });
}

const login = async (req, res) => {
    const { username, password, accessType } = req.body;

    try {
        const [users] = await db.query(
            `SELECT u.*, r.nombre as rol_nombre
             FROM usuario u
             JOIN rol r ON u.id_rol = r.id_rol
             WHERE u.nombre_usuario = $1 AND u.estado = TRUE`,
            [username]
        );

        if (users.length === 0) {
            await auditarAuth(req, {
                accion: 'LOGIN_FALLIDO',
                username,
                descripcion: 'Intento de login con usuario inexistente o inactivo',
                estado: 'FALLIDO',
                metadata: { accessType }
            });
            return res.status(401).json({ error: 'Usuario o contrasena incorrectos' });
        }

        const user = users[0];

        if (accessType === 'cajero' && ![1, 2, 3].includes(user.id_rol)) {
            await auditarAuth(req, {
                user: {
                    id_usuario: user.id_usuario,
                    username: user.nombre_usuario,
                    rol: user.rol_nombre
                },
                accion: 'ACCESO_DENEGADO_ROL',
                descripcion: 'Usuario intento acceder como Cajero/Gerente/Administrador sin rol permitido',
                estado: 'DENEGADO',
                metadata: { accessType, rol: user.rol_nombre }
            });
            return res.status(403).json({ error: 'No tienes permisos para acceder como Cajero/Gerente/Administrador' });
        }

        let validPassword = false;

        if (password === user.password_hash) {
            validPassword = true;
        } else if (user.password_hash && user.password_hash.startsWith('$2')) {
            validPassword = await bcrypt.compare(password, user.password_hash);
        }

        if (!validPassword) {
            await db.query(
                'UPDATE usuario SET intentos_fallidos = intentos_fallidos + 1 WHERE id_usuario = $1',
                [user.id_usuario]
            );
            await auditarAuth(req, {
                user: {
                    id_usuario: user.id_usuario,
                    username: user.nombre_usuario,
                    rol: user.rol_nombre
                },
                accion: 'LOGIN_FALLIDO',
                descripcion: 'Password incorrecto',
                estado: 'FALLIDO',
                metadata: { accessType }
            });
            return res.status(401).json({ error: 'Usuario o contrasena incorrectos' });
        }

        await db.query(
            'UPDATE usuario SET intentos_fallidos = 0, ultimo_acceso = NOW() WHERE id_usuario = $1',
            [user.id_usuario]
        );

        await auditarAuth(req, {
            user: {
                id_usuario: user.id_usuario,
                username: user.nombre_usuario,
                rol: user.rol_nombre
            },
            accion: 'LOGIN_EXITOSO',
            descripcion: 'Login exitoso',
            estado: 'OK',
            metadata: { accessType }
        });

        const token = jwt.sign(
            {
                id_usuario: user.id_usuario,
                username: user.nombre_usuario,
                rol: user.rol_nombre,
                accessType
            },
            process.env.JWT_SECRET || 'mi_secreto_temporal',
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user.id_usuario,
                username: user.nombre_usuario,
                email: user.correo,
                rol: user.rol_nombre,
                accessType,
                codigo_empleado: user.codigo_empleado,
                dpi: user.dpi
            }
        });
    } catch (error) {
        console.error('Error en login:', error);
        await auditarAuth(req, {
            accion: 'ERROR_CRITICO',
            descripcion: 'Error critico en login',
            estado: 'ERROR',
            metadata: { error: error.message }
        });
        res.status(500).json({
            error: process.env.NODE_ENV === 'production'
                ? 'Error en el servidor'
                : `Error en el servidor: ${error.message}`
        });
    }
};

const register = async (req, res) => {
    const { username, email, password, nombre_completo, dpi, regType, codigo_empleado } = req.body;

    try {
        if (!username || !email || !password || !dpi) {
            return res.status(400).json({ error: 'Todos los campos son requeridos' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'La contrasena debe tener al menos 6 caracteres' });
        }

        const [existingUser] = await db.query(
            'SELECT id_usuario FROM usuario WHERE nombre_usuario = $1 OR correo = $2',
            [username, email]
        );

        if (existingUser.length > 0) {
            return res.status(400).json({ error: 'El usuario o correo ya existe' });
        }

        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);
        const connection = await db.getConnection();

        await connection.beginTransaction();

        try {
            let id_rol = 4;
            let mensaje = '';

            if (regType === 'cajero') {
                if (!codigo_empleado) {
                    throw new Error('El codigo de empleado es requerido');
                }

                const [existingEmpleado] = await connection.query(
                    'SELECT id_usuario FROM usuario WHERE codigo_empleado = $1',
                    [codigo_empleado]
                );

                if (existingEmpleado.length > 0) {
                    throw new Error('El codigo de empleado ya existe');
                }

                id_rol = 3;
                mensaje = `Cajero creado exitosamente con codigo: ${codigo_empleado}`;
            } else {
                mensaje = 'Usuario registrado exitosamente.';
            }

            const [clienteExistente] = await connection.query(
                'SELECT id_cliente, nombre, apellido FROM cliente WHERE dpi = $1',
                [dpi]
            );

            let id_cliente = null;

            if (clienteExistente.length > 0) {
                id_cliente = clienteExistente[0].id_cliente;
                mensaje += ' Bienvenido nuevamente, tus datos ya estaban registrados.';
            }

            const [result] = await connection.query(
                `INSERT INTO usuario (nombre_usuario, correo, password_hash, id_rol, codigo_empleado, dpi, id_cliente, estado, fecha_creacion)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, NOW())
                 RETURNING id_usuario AS id`,
                [username, email, password_hash, id_rol, codigo_empleado || null, dpi, id_cliente]
            );

            if (clienteExistente.length === 0) {
                const nombreParts = String(nombre_completo || username).split(' ');
                const nombre = nombreParts[0];
                const apellido = nombreParts.slice(1).join(' ') || '';

                const [cliente] = await connection.query(
                    `INSERT INTO cliente (nombre, apellido, dpi, correo, id_usuario, estado, fecha_registro)
                     VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
                     RETURNING id_cliente AS id`,
                    [nombre, apellido, dpi, email, result.insertId]
                );
                id_cliente = cliente.insertId;

                await connection.query(
                    'UPDATE usuario SET id_cliente = $1 WHERE id_usuario = $2',
                    [id_cliente, result.insertId]
                );
            } else {
                await connection.query(
                    'UPDATE usuario SET id_cliente = $1 WHERE id_usuario = $2',
                    [id_cliente, result.insertId]
                );
                await connection.query(
                    'UPDATE cliente SET id_usuario = $1, correo = $2 WHERE id_cliente = $3',
                    [result.insertId, email, id_cliente]
                );
            }

            await connection.commit();

            await auditarAuth(req, {
                id_usuario: result.insertId,
                username,
                rol: id_rol === 3 ? 'CAJERO' : 'CLIENTE',
                accion: 'REGISTRO',
                descripcion: 'Registro de usuario',
                estado: 'OK',
                metadata: { regType, codigo_empleado, dpi, id_cliente }
            });

            res.status(201).json({ message: mensaje, id_usuario: result.insertId });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error en registro:', error);
        await auditarAuth(req, {
            username,
            accion: 'REGISTRO',
            descripcion: 'Registro fallido',
            estado: 'ERROR',
            metadata: { error: error.message, regType }
        });
        res.status(500).json({ error: error.message || 'Error al crear usuario' });
    }
};

const getProfile = async (req, res) => {
    try {
        const [users] = await db.query(
            `SELECT u.id_usuario, u.nombre_usuario, u.correo, u.id_rol, u.codigo_empleado, u.dpi, u.estado,
                    c.id_cliente, c.nombre, c.apellido
             FROM usuario u
             LEFT JOIN cliente c ON u.id_cliente = c.id_cliente
             WHERE u.id_usuario = $1`,
            [req.user.id_usuario]
        );
        res.json(users[0]);
    } catch (error) {
        console.error('Error en perfil:', error);
        res.status(500).json({ error: 'Error al obtener perfil' });
    }
};

const cambiarPassword = async (req, res) => {
    try {
        const { username, dpi, nueva_password, confirmar_password } = req.body;

        if (!username || !dpi || !nueva_password || !confirmar_password) {
            return res.status(400).json({ error: 'Todos los campos son requeridos' });
        }

        if (nueva_password !== confirmar_password) {
            return res.status(400).json({ error: 'Las contrasenas no coinciden' });
        }

        if (nueva_password.length < 6) {
            return res.status(400).json({ error: 'La nueva contrasena debe tener al menos 6 caracteres' });
        }

        const [users] = await db.query(
            `SELECT u.*, c.dpi as cliente_dpi
             FROM usuario u
             LEFT JOIN cliente c ON u.id_cliente = c.id_cliente
             WHERE u.nombre_usuario = $1 AND (u.dpi = $2 OR c.dpi = $3) AND u.estado = TRUE`,
            [username, dpi, dpi]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'No se encontro un usuario con ese nombre de usuario y DPI' });
        }

        const user = users[0];
        const salt = await bcrypt.genSalt(10);
        const nueva_password_hash = await bcrypt.hash(nueva_password, salt);

        await db.query(
            'UPDATE usuario SET password_hash = $1 WHERE id_usuario = $2',
            [nueva_password_hash, user.id_usuario]
        );

        res.json({
            success: true,
            message: `Contrasena actualizada exitosamente para el usuario: ${username}`
        });
    } catch (error) {
        console.error('Error en cambiarPassword:', error);
        res.status(500).json({ error: `Error al cambiar la contrasena: ${error.message}` });
    }
};

module.exports = { login, register, getProfile, cambiarPassword };

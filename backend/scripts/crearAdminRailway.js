const bcrypt = require('bcryptjs');
const db = require('../config/db');

const ADMIN = {
    username: 'admin',
    email: 'admin@bancogt.com',
    password: 'admin123',
    rol: 'ADMIN',
    accessType: 'cajero',
    codigoEmpleado: 'EMP001',
    dpi: '1234567890101'
};

function hasColumn(columns, name) {
    return columns.some((column) => column.column_name === name);
}

function getColumn(columns, candidates) {
    return candidates.find((name) => hasColumn(columns, name)) || null;
}

function getEstadoValue(columns) {
    const estado = columns.find((column) => column.column_name === 'estado');

    if (!estado) {
        return null;
    }

    if (estado.data_type === 'boolean') {
        return true;
    }

    return 'ACTIVO';
}

async function getUsuarioColumns() {
    const [columns] = await db.query(
        `SELECT column_name, data_type, udt_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'usuario'
         ORDER BY ordinal_position`
    );

    if (!columns.length) {
        throw new Error('No existe la tabla usuario en PostgreSQL');
    }

    return columns;
}

async function getAdminRoleId() {
    const [roles] = await db.query(
        `SELECT id_rol
         FROM rol
         WHERE UPPER(nombre) = 'ADMIN'
         LIMIT 1`
    );

    if (roles.length) {
        return roles[0].id_rol;
    }

    const [inserted] = await db.query(
        `INSERT INTO rol (nombre)
         VALUES ('ADMIN')
         RETURNING id_rol`
    );

    return inserted[0].id_rol;
}

function addValue(columnsToWrite, values, column, value) {
    if (!column || value === null || value === undefined) {
        return;
    }

    columnsToWrite.push(column);
    values.push(value);
}

function buildInsertSql(columnsToWrite) {
    const placeholders = columnsToWrite.map((_, index) => `$${index + 1}`).join(', ');
    const columnsSql = columnsToWrite.join(', ');

    return `INSERT INTO usuario (${columnsSql}) VALUES (${placeholders}) RETURNING id_usuario`;
}

function buildUpdateSql(columnsToWrite, usernameColumn) {
    const sets = columnsToWrite.map((column, index) => `${column} = $${index + 1}`).join(', ');
    const usernameParam = `$${columnsToWrite.length + 1}`;

    return `UPDATE usuario SET ${sets} WHERE ${usernameColumn} = ${usernameParam} RETURNING id_usuario`;
}

async function main() {
    const columns = await getUsuarioColumns();
    const usernameColumn = getColumn(columns, ['username', 'nombre_usuario']);
    const emailColumn = getColumn(columns, ['email', 'correo']);
    const passwordColumn = getColumn(columns, ['password_hash', 'password']);
    const accessTypeColumn = getColumn(columns, ['access_type', 'tipo_acceso']);
    const codigoEmpleadoColumn = getColumn(columns, ['codigo_empleado']);
    const dpiColumn = getColumn(columns, ['dpi']);
    const fechaCreacionColumn = getColumn(columns, ['fecha_creacion']);

    if (!usernameColumn || !emailColumn || !passwordColumn) {
        throw new Error('La tabla usuario no tiene columnas compatibles para username/email/password');
    }

    const passwordHash = await bcrypt.hash(ADMIN.password, 10);
    const estadoValue = getEstadoValue(columns);
    const roleId = hasColumn(columns, 'id_rol') ? await getAdminRoleId() : null;

    const [existing] = await db.query(
        `SELECT *
         FROM usuario
         WHERE ${usernameColumn} = $1
         LIMIT 1`,
        [ADMIN.username]
    );

    if (existing.length) {
        const updateColumns = [];
        const updateValues = [];

        addValue(updateColumns, updateValues, passwordColumn, passwordHash);
        addValue(updateColumns, updateValues, accessTypeColumn, ADMIN.accessType);
        addValue(updateColumns, updateValues, hasColumn(columns, 'rol') ? 'rol' : null, ADMIN.rol);
        addValue(updateColumns, updateValues, hasColumn(columns, 'id_rol') ? 'id_rol' : null, roleId);
        addValue(updateColumns, updateValues, hasColumn(columns, 'estado') ? 'estado' : null, estadoValue);

        const sql = buildUpdateSql(updateColumns, usernameColumn);
        updateValues.push(ADMIN.username);

        const [updated] = await db.query(sql, updateValues);
        console.log(`Admin actualizado correctamente. id_usuario=${updated[0]?.id_usuario || existing[0].id_usuario}`);
        return;
    }

    const insertColumns = [];
    const insertValues = [];

    addValue(insertColumns, insertValues, usernameColumn, ADMIN.username);
    addValue(insertColumns, insertValues, emailColumn, ADMIN.email);
    addValue(insertColumns, insertValues, passwordColumn, passwordHash);
    addValue(insertColumns, insertValues, accessTypeColumn, ADMIN.accessType);
    addValue(insertColumns, insertValues, hasColumn(columns, 'rol') ? 'rol' : null, ADMIN.rol);
    addValue(insertColumns, insertValues, hasColumn(columns, 'id_rol') ? 'id_rol' : null, roleId);
    addValue(insertColumns, insertValues, codigoEmpleadoColumn, ADMIN.codigoEmpleado);
    addValue(insertColumns, insertValues, dpiColumn, ADMIN.dpi);
    addValue(insertColumns, insertValues, hasColumn(columns, 'estado') ? 'estado' : null, estadoValue);

    if (fechaCreacionColumn) {
        insertColumns.push(fechaCreacionColumn);
        insertValues.push(new Date());
    }

    const sql = buildInsertSql(insertColumns);
    const [inserted] = await db.query(sql, insertValues);

    console.log(`Admin creado correctamente. id_usuario=${inserted[0]?.id_usuario}`);
}

main()
    .catch((error) => {
        console.error('Error creando admin Railway:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await db.pool.end();
    });

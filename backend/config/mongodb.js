const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');

dotenv.config();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const databaseName = process.env.MONGODB_DB || 'banco_notificaciones';

let client = null;
let database = null;
let connectionPromise = null;

const TELEGRAM_COLLECTIONS = [
    'usuarios_telegram',
    'notificaciones_telegram',
    'logs_telegram'
];

function sameIndexKey(currentKey, desiredKey) {
    const current = JSON.stringify(currentKey || {});
    const desired = JSON.stringify(desiredKey || {});

    return current === desired;
}

async function ensureIndex(collection, keys, options = {}) {
    const indexes = await collection.indexes();
    const exists = indexes.some((index) => sameIndexKey(index.key, keys));

    if (exists) {
        return null;
    }

    return collection.createIndex(keys, options);
}

async function ensureCollection(db, collectionName) {
    const exists = await db.listCollections({ name: collectionName }, { nameOnly: true }).hasNext();

    if (exists) {
        return;
    }

    try {
        await db.createCollection(collectionName);
    } catch (error) {
        if (error.codeName === 'NamespaceExists' || error.code === 48) {
            return;
        }

        throw error;
    }
}

async function ensureCollections(db) {
    for (const collectionName of TELEGRAM_COLLECTIONS) {
        await ensureCollection(db, collectionName);
    }
}

async function createIndexes(db) {
    const usuarios = db.collection('usuarios_telegram');
    const notificaciones = db.collection('notificaciones_telegram');
    const logs = db.collection('logs_telegram');

    await Promise.all([
        ensureIndex(
            usuarios,
            { id_usuario: 1 },
            {
                unique: true,
                partialFilterExpression: { id_usuario: { $exists: true } }
            }
        ),
        ensureIndex(usuarios, { chat_id: 1 }),
        ensureIndex(usuarios, { username: 1 }),
        ensureIndex(notificaciones, { id_usuario: 1, fecha: -1 }),
        ensureIndex(notificaciones, { tipo: 1, fecha: -1 }),
        ensureIndex(logs, { fecha: -1 })
    ]);
}

async function connectMongo() {
    if (database) {
        return database;
    }

    if (connectionPromise) {
        return connectionPromise;
    }

    connectionPromise = (async () => {
        try {
            client = new MongoClient(uri, {
                serverSelectionTimeoutMS: 5000
               });
               await client.connect();
               database = client.db(databaseName);
               try {
                   await ensureCollections(database);
                   await createIndexes(database);
               } catch (indexError) {
                   console.error('[Telegram] error creando indices Mongo:', indexError.message);
               }
               console.log(`[Telegram] Mongo conectado: ${databaseName}`);
               return database;
        } catch (error) {
            console.error('[Telegram] error Mongo:', error.message);
            database = null;
            connectionPromise = null;
            return null;
        }
    })();

    return connectionPromise;
}

function getDb() {
    return database;
}

async function getMongoDb() {
    return database || connectMongo();
}

module.exports = {
    connectMongo,
    getDb,
    getMongoDb
};

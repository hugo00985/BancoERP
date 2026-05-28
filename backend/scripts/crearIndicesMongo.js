const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');

dotenv.config();

const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017';
const databaseName = process.env.MONGODB_DB || 'banco_notificaciones';
const client = new MongoClient(uri);

async function crearIndices() {
    try {
        await client.connect();
        console.log('✅ Conectado a MongoDB');
        
        const db = client.db(databaseName);
        const collection = db.collection('usuarios_telegram');
        
        // Crear índices
        await collection.createIndex({ usuario: 1 }, { unique: true });
        console.log('✅ Índice único creado en "usuario"');
        
        await collection.createIndex({ chat_id: 1 });
        console.log('✅ Índice creado en "chat_id"');
        
        await collection.createIndex({ fecha_vinculacion: -1 });
        console.log('✅ Índice creado en "fecha_vinculacion"');
        
        await collection.createIndex({ activo: 1 });
        console.log('✅ Índice creado en "activo"');
        
        console.log('\n🎉 Todos los índices fueron creados exitosamente');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.close();
        console.log('🔌 Conexión cerrada');
    }
}

crearIndices();

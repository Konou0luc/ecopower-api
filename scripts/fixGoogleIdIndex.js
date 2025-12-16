const mongoose = require('mongoose');
require('dotenv').config();

async function fixGoogleIdIndex() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    
    if (!mongoUri) {
      console.error('❌ Erreur: MONGO_URI ou MONGODB_URI doit être défini dans le fichier .env');
      process.exit(1);
    }
    
    console.log('🔌 Connexion à MongoDB...');
    mongoose.set('strictQuery', false);
    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB');
    
    const db = mongoose.connection.db;
    const collection = db.collection('users');
    
    // Supprimer l'ancien index s'il existe
    try {
      await collection.dropIndex('googleId_1');
      console.log('✅ Ancien index googleId_1 supprimé');
    } catch (e) {
      if (e.code === 27) {
        console.log('ℹ️  L\'index googleId_1 n\'existe pas, on continue...');
      } else {
        throw e;
      }
    }
    
    // Créer le nouvel index sparse
    await collection.createIndex(
      { googleId: 1 },
      { 
        unique: true, 
        sparse: true,
        name: 'googleId_1'
      }
    );
    console.log('✅ Nouvel index googleId_1 créé (unique, sparse)');
    
    console.log('\n✅ Index corrigé avec succès !');
    console.log('   L\'index permet maintenant plusieurs valeurs null pour googleId.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors de la correction de l\'index:', error);
    process.exit(1);
  }
}

fixGoogleIdIndex();


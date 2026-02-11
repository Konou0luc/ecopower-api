const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function createAdmin() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    
    if (!mongoUri) {
      console.error('❌ Erreur: MONGO_URI ou MONGODB_URI doit être défini dans le fichier .env');
      process.exit(1);
    }
    
    console.log('🔌 Connexion à MongoDB...');
    mongoose.set('strictQuery', false);
    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB\n');
    
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      console.log('⚠️  Un administrateur existe déjà:', existingAdmin.email);
      console.log('   Si vous voulez le remplacer, supprimez-le d\'abord ou modifiez ce script.');
      process.exit(0);
    }

    const adminData = {
      nom: 'Admin',
      prenom: 'System',
      email: 'admin@ecopower.com',
      telephone: '+22897240460',
      motDePasse: 'Admin123!',
      role: 'admin',
      authMethod: 'email'
    };
    
    console.log('📝 Création du compte administrateur...');
    console.log(`   Email: ${adminData.email}`);
    console.log(`   Téléphone: ${adminData.telephone}`);
    console.log(`   Mot de passe: ${adminData.motDePasse}\n`);
    
    const admin = new User(adminData);
    await admin.save();
    
    console.log('✅ Compte administrateur créé avec succès !');
    console.log('📧 Email:', adminData.email);
    console.log('🔑 Mot de passe:', adminData.motDePasse);
    console.log('\n⚠️  IMPORTANT: Changez ce mot de passe après votre première connexion !');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors de la création de l\'admin:', error);
    process.exit(1);
  }
}

createAdmin();


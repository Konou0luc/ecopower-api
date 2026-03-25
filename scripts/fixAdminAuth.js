const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function fixAdminAuth() {
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
    
    const email = 'ecopowerafrique@gmail.com';
    const admin = await User.findOne({ email });
    
    if (!admin) {
      console.error(`❌ Erreur: Compte admin avec l'email ${email} non trouvé.`);
      process.exit(1);
    }
    
    console.log('👤 Compte admin trouvé:');
    console.log(`   Email: ${admin.email}`);
    console.log(`   Méthode actuelle: ${admin.authMethod}`);
    
    // Réinitialisation de la méthode d'authentification à 'email'
    admin.authMethod = 'email';
    
    // Si le mot de passe est manquant (ce qui arrive parfois avec Google Sign-In), 
    // on en remet un par défaut ou on s'assure qu'il en a un.
    // Note: Le mot de passe original du script createAdmin.js était: !U57X"@6P&`xX:|Akjdt
    if (!admin.motDePasse) {
        console.log('📝 Mot de passe manquant, réinitialisation au mot de passe par défaut...');
        admin.motDePasse = '!U57X"@6P&`xX:|Akjdt';
    }

    // Supprimer le googleId pour éviter tout conflit
    admin.googleId = undefined;
    
    await admin.save();
    
    console.log('\n✅ Compte administrateur réparé avec succès !');
    console.log('📧 Email:', admin.email);
    console.log('🔑 Méthode: email');
    console.log('🔓 Vous pouvez maintenant vous connecter avec votre mot de passe habituel sur le site web.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur lors de la réparation de l\'admin:', error);
    process.exit(1);
  }
}

fixAdminAuth();

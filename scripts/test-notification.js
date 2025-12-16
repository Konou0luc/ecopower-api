const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function testNotification() {
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
    
    // Récupérer les arguments de la ligne de commande
    const args = process.argv.slice(2);
    const userId = args[0];
    const message = args[1] || `Notification de test - ${new Date().toLocaleString('fr-FR')}`;
    
    if (!userId) {
      console.log('📋 Utilisateurs avec deviceToken enregistré:');
      const usersWithToken = await User.find({ 
        deviceToken: { $exists: true, $ne: null, $nin: ['', null] } 
      }).select('_id nom prenom email role deviceToken');
      
      if (usersWithToken.length === 0) {
        console.log('   ⚠️  Aucun utilisateur n\'a de deviceToken enregistré.');
        console.log('   💡 Pour enregistrer un deviceToken, connectez-vous à l\'app mobile.');
        process.exit(0);
      }
      
      console.log(`\n   Trouvé ${usersWithToken.length} utilisateur(s):\n`);
      usersWithToken.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.prenom} ${user.nom} (${user.email})`);
        console.log(`      ID: ${user._id}`);
        console.log(`      Rôle: ${user.role}`);
        console.log(`      Token: ${user.deviceToken.substring(0, 30)}...`);
        console.log('');
      });
      
      console.log('💡 Pour tester une notification, utilisez:');
      console.log('   node scripts/test-notification.js <userId> [message]');
      console.log('\n   Exemple:');
      console.log(`   node scripts/test-notification.js ${usersWithToken[0]._id} "Bonjour, ceci est un test"`);
      process.exit(0);
    }
    
    // Trouver l'utilisateur
    const user = await User.findById(userId);
    if (!user) {
      console.error(`❌ Utilisateur avec l'ID ${userId} non trouvé`);
      process.exit(1);
    }
    
    console.log(`👤 Utilisateur trouvé: ${user.prenom} ${user.nom} (${user.email})`);
    console.log(`   Rôle: ${user.role}`);
    
    if (!user.deviceToken) {
      console.error('❌ Cet utilisateur n\'a pas de deviceToken enregistré.');
      console.error('   💡 Pour enregistrer un deviceToken:');
      console.error('   1. Connectez-vous à l\'app mobile avec ce compte');
      console.error('   2. Le deviceToken sera automatiquement enregistré');
      process.exit(1);
    }
    
    console.log(`   DeviceToken: ${user.deviceToken.substring(0, 30)}...`);
    console.log(`\n📤 Envoi de la notification...`);
    console.log(`   Message: "${message}"\n`);
    
    // Importer le module de notifications
    const notifications = require('../utils/notifications');
    
    // Envoyer la notification
    const result = await notifications.envoyer(userId, message);
    
    if (result.success) {
      console.log('✅ Notification envoyée avec succès !');
      console.log(`   Réponse FCM: ${JSON.stringify(result.response, null, 2)}`);
    } else {
      console.error('❌ Erreur lors de l\'envoi de la notification:');
      console.error(`   ${result.error}`);
      if (result.errorDetails) {
        console.error(`   Détails: ${JSON.stringify(result.errorDetails, null, 2)}`);
      }
      process.exit(1);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

testNotification();


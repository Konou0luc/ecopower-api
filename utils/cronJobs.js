const cron = require('node-cron');
const FREE_MODE = process.env.FREE_MODE === 'true';
const Abonnement = require('../models/Abonnement');
const Facture = require('../models/Facture');
const { notifySubscriptionExpiry, notifyOverdueInvoices } = require('./notifications');


const checkExpiredSubscriptions = async () => {
  try {
    console.log('🕐 Vérification des abonnements expirés...');
    
    
    const result = await Abonnement.updateExpiredSubscriptions();
    
    console.log(`✅ ${result.modifiedCount} abonnements marqués comme expirés`);
  } catch (error) {
    console.error('❌ Erreur lors de la vérification des abonnements expirés:', error);
  }
};


const checkOverdueInvoices = async () => {
  try {
    console.log('🕐 Vérification des factures en retard...');
    
    const facturesEnRetard = await Facture.find({
      dateEcheance: { $lt: new Date() },
      statut: 'non payée'
    });

    for (const facture of facturesEnRetard) {
      facture.statut = 'en retard';
      await facture.save();
      console.log(`⚠️ Facture en retard: ${facture.numeroFacture}`);
    }

    console.log(`✅ ${facturesEnRetard.length} factures marquées comme en retard`);
  } catch (error) {
    console.error('❌ Erreur lors de la vérification des factures en retard:', error);
  }
};


const cleanupOldMessages = async () => {
  try {
    console.log('🕐 Nettoyage des anciens messages...');
    
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const Message = require('../models/Message');
    const result = await Message.deleteMany({
      dateEnvoi: { $lt: sixMonthsAgo },
      type: { $in: ['text', 'system'] } 
    });

    console.log(`✅ ${result.deletedCount} anciens messages supprimés`);
  } catch (error) {
    console.error('❌ Erreur lors du nettoyage des messages:', error);
  }
};


const generateDailyStats = async () => {
  try {
    console.log('🕐 Génération des statistiques quotidiennes...');
    
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    
    const Consommation = require('../models/Consommation');
    const consommationsHier = await Consommation.countDocuments({
      createdAt: {
        $gte: yesterday,
        $lt: today
      }
    });
    
    
    const facturesHier = await Facture.countDocuments({
      dateEmission: {
        $gte: yesterday,
        $lt: today
      }
    });
    
    
    const paiementsHier = await Facture.countDocuments({
      datePaiement: {
        $gte: yesterday,
        $lt: today
      },
      statut: 'payée'
    });
    
    console.log(`📊 Statistiques du ${yesterday.toLocaleDateString()}:`);
    console.log(`   - Consommations enregistrées: ${consommationsHier}`);
    console.log(`   - Factures générées: ${facturesHier}`);
    console.log(`   - Paiements reçus: ${paiementsHier}`);
    
  } catch (error) {
    console.error('❌ Erreur lors de la génération des statistiques:', error);
  }
};


const checkDatabaseHealth = async () => {
  try {
    console.log('🕐 Vérification de la santé de la base de données...');
    
    
    const mongoose = require('mongoose');
    const dbState = mongoose.connection.readyState;
    
    const states = {
      0: 'déconnecté',
      1: 'connecté',
      2: 'connexion en cours',
      3: 'déconnexion en cours'
    };
    
    console.log(`📊 État de la base de données: ${states[dbState]}`);
    
    
    const User = require('../models/User');
    const Abonnement = require('../models/Abonnement');
    const Facture = require('../models/Facture');
    const Consommation = require('../models/Consommation');
    
    const stats = {
      users: await User.countDocuments(),
      abonnements: await Abonnement.countDocuments(),
      factures: await Facture.countDocuments(),
      consommations: await Consommation.countDocuments()
    };
    
    console.log('📊 Statistiques de la base de données:');
    console.log(`   - Utilisateurs: ${stats.users}`);
    console.log(`   - Abonnements: ${stats.abonnements}`);
    console.log(`   - Factures: ${stats.factures}`);
    console.log(`   - Consommations: ${stats.consommations}`);
    
  } catch (error) {
    console.error('❌ Erreur lors de la vérification de la santé de la DB:', error);
  }
};


const initCronJobs = () => {
  if (FREE_MODE) {
    console.log('⏸️ [CRON] Mode gratuit activé: cron abonnements désactivés');
    return;
    }
  console.log('🚀 Initialisation des tâches cron...');
  
  
  cron.schedule('0 2 * * *', checkExpiredSubscriptions, {
    scheduled: true,
    timezone: "Europe/Paris"
  });
  
  
  cron.schedule('0 3 * * *', checkOverdueInvoices, {
    scheduled: true,
    timezone: "Europe/Paris"
  });
  
  
  cron.schedule('0 9 * * *', notifySubscriptionExpiry, {
    scheduled: true,
    timezone: "Europe/Paris"
  });
  
  
  cron.schedule('0 10 * * *', notifyOverdueInvoices, {
    scheduled: true,
    timezone: "Europe/Paris"
  });
  
  
  cron.schedule('0 4 * * 0', cleanupOldMessages, {
    scheduled: true,
    timezone: "Europe/Paris"
  });
  
  
  cron.schedule('0 6 * * *', generateDailyStats, {
    scheduled: true,
    timezone: "Europe/Paris"
  });
  
  
  cron.schedule('0 * * * *', checkDatabaseHealth, {
    scheduled: true,
    timezone: "Europe/Paris"
  });
  
  console.log('✅ Tâches cron initialisées');
};


const stopCronJobs = () => {
  console.log('🛑 Arrêt des tâches cron...');
  cron.getTasks().forEach(task => task.stop());
  console.log('✅ Tâches cron arrêtées');
};


const runTaskManually = async (taskName) => {
  console.log(`🔧 Exécution manuelle de la tâche: ${taskName}`);
  
  switch (taskName) {
    case 'checkExpiredSubscriptions':
      await checkExpiredSubscriptions();
      break;
    case 'checkOverdueInvoices':
      await checkOverdueInvoices();
      break;
    case 'notifySubscriptionExpiry':
      await notifySubscriptionExpiry();
      break;
    case 'notifyOverdueInvoices':
      await notifyOverdueInvoices();
      break;
    case 'cleanupOldMessages':
      await cleanupOldMessages();
      break;
    case 'generateDailyStats':
      await generateDailyStats();
      break;
    case 'checkDatabaseHealth':
      await checkDatabaseHealth();
      break;
    default:
      console.error(`❌ Tâche inconnue: ${taskName}`);
  }
};

module.exports = {
  initCronJobs,
  stopCronJobs,
  runTaskManually,
  checkExpiredSubscriptions,
  checkOverdueInvoices,
  cleanupOldMessages,
  generateDailyStats,
  checkDatabaseHealth
};

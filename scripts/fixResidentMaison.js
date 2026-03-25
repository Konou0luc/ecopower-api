const mongoose = require('mongoose');
const User = require('../models/User');
const Maison = require('../models/Maison');
require('dotenv').config();

async function checkAndFixResident() {
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
    
    // On cherche tous les résidents
    const tousLesResidents = await User.find({ role: 'resident' });
    
    console.log(`🔍 ${tousLesResidents.length} résident(s) trouvé(s) au total.`);

    for (const resident of tousLesResidents) {
        console.log(`\n👤 Vérification de : ${resident.email} (maisonId actuel: ${resident.maisonId})`);
        
        // On cherche une maison qui contient l'ID de ce résident dans sa listeResidents
        const maison = await Maison.findOne({ listeResidents: resident._id });
        
        if (maison) {
            console.log(`🏠 Maison trouvée dans la collection Maisons : ${maison.nomMaison} (${maison._id})`);
            if (!resident.maisonId || resident.maisonId.toString() !== maison._id.toString()) {
                resident.maisonId = maison._id;
                await resident.save();
                console.log(`✅ maisonId MIS À JOUR pour ${resident.email}`);
            } else {
                console.log(`✨ maisonId déjà correct pour ${resident.email}`);
            }
        } else {
            console.log(`⚠️ Aucune maison ne contient ce résident dans sa 'listeResidents'.`);
        }
    }
    
    console.log('\n🏁 Opération terminée.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

checkAndFixResident();

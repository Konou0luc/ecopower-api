const mongoose = require('mongoose');
const User = require('../models/User');
const Maison = require('../models/Maison');
require('dotenv').config();

async function debugMaisonResidents() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB\n');
    
    const email = 'yaoayekoele2@gmail.com';
    const user = await User.findOne({ email });
    
    if (!user) {
        console.log(`❌ Utilisateur ${email} non trouvé`);
        process.exit(1);
    }
    
    console.log(`👤 Utilisateur trouvé: ${user.email} (${user._id}) role: ${user.role} maisonId: ${user.maisonId}`);
    
    const maisons = await Maison.find({
        $or: [
            { listeResidents: user._id },
            { listeResidents: user._id.toString() }
        ]
    });
    
    console.log(`\n🏠 Maisons trouvées via listeResidents (${maisons.length}):`);
    maisons.forEach(m => {
        console.log(`   - ${m.nomMaison} (${m._id})`);
        console.log(`     listeResidents: ${JSON.stringify(m.listeResidents)}`);
        if (m.listeResidents && m.listeResidents.length > 0) {
            console.log(`     Type du premier résident: ${typeof m.listeResidents[0]}`);
            console.log(`     Est-ce un ObjectId? ${m.listeResidents[0] instanceof mongoose.Types.ObjectId}`);
        }
    });

    const maisonById = await Maison.findById(user.maisonId);
    console.log(`\n🏠 Maison trouvée via user.maisonId: ${maisonById ? maisonById.nomMaison : 'AUCUNE'}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

debugMaisonResidents();

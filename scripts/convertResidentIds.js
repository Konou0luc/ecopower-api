const mongoose = require('mongoose');
require('dotenv').config();

async function convertResidentStringsToObjectIds() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB\n');
    
    const db = mongoose.connection.db;
    const collection = db.collection('maisons');
    
    const maisons = await collection.find({}).toArray();
    console.log(`🔍 Vérification de ${maisons.length} maisons via collection directe...`);

    for (const maison of maisons) {
        let modified = false;
        const newListe = [];
        
        if (maison.listeResidents && maison.listeResidents.length > 0) {
            for (const residentId of maison.listeResidents) {
                if (typeof residentId === 'string' && /^[0-9a-fA-F]{24}$/.test(residentId)) {
                    newListe.push(new mongoose.Types.ObjectId(residentId));
                    modified = true;
                } else {
                    newListe.push(residentId);
                }
            }
        }
        
        if (modified) {
            await collection.updateOne(
                { _id: maison._id },
                { $set: { listeResidents: newListe } }
            );
            console.log(`✅ Liste des résidents convertie pour la maison : ${maison.nomMaison || maison._id}`);
        }
    }
    
    console.log('\n🏁 Conversion terminée.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

convertResidentStringsToObjectIds();

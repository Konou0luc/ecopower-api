const mongoose = require('mongoose');

const abonnementSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['basic', 'premium', 'enterprise'],
    required: true
  },
  prix: {
    type: Number,
    required: true,
    min: 0
  },
  nbResidentsMax: {
    type: Number,
    required: true,
    min: 1
  },
  dateDebut: {
    type: Date,
    required: true,
    default: Date.now
  },
  dateFin: {
    type: Date,
    required: true
  },
  statut: {
    type: String,
    enum: ['actif', 'expiré', 'suspendu'],
    default: 'actif'
  },
  isActive: {
    type: Boolean,
    default: false
  },
  proprietaireId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});


abonnementSchema.methods.isActif = function() {
  const maintenant = new Date();
  
  
  if (this.dateFin <= maintenant && this.statut === 'actif') {
    this.statut = 'expiré';
    this.isActive = false;
    this.save().catch(err => console.error('Erreur lors de la mise à jour du statut:', err));
  }
  
  return this.statut === 'actif' && this.dateFin > maintenant && this.isActive === true;
};


abonnementSchema.methods.joursRestants = function() {
  const maintenant = new Date();
  const diffTime = this.dateFin - maintenant;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
};


abonnementSchema.methods.renouveler = function() {
  const maintenant = new Date();
  const nouvelleDateFin = new Date(maintenant);
  nouvelleDateFin.setMonth(nouvelleDateFin.getMonth() + 1);
  
  this.dateDebut = maintenant;
  this.dateFin = nouvelleDateFin;
  this.statut = 'actif';
  this.isActive = true;
  
  console.log(`🔄 [ABONNEMENT] Renouvellement: ${this._id}`);
  console.log(`   - Nouvelle date début: ${this.dateDebut}`);
  console.log(`   - Nouvelle date fin: ${this.dateFin}`);
  console.log(`   - Statut: ${this.statut}`);
  console.log(`   - isActive: ${this.isActive}`);
  
  return this.save();
};


abonnementSchema.statics.updateExpiredSubscriptions = async function() {
  const maintenant = new Date();
  const result = await this.updateMany(
    {
      statut: 'actif',
      dateFin: { $lte: maintenant }
    },
    {
      $set: {
        statut: 'expiré',
        isActive: false
      }
    }
  );
  
  console.log(`📅 [ABONNEMENT] ${result.modifiedCount} abonnements marqués comme expirés`);
  return result;
};


abonnementSchema.index({ proprietaireId: 1, statut: 1 });
abonnementSchema.index({ dateFin: 1, statut: 1 });

module.exports = mongoose.model('Abonnement', abonnementSchema);

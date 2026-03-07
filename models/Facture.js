const mongoose = require('mongoose');

const factureSchema = new mongoose.Schema({
  residentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  maisonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Maison',
    required: true
  },
  consommationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Consommation',
    required: true
  },
  montant: {
    type: Number,
    required: true,
    min: 0
  },
  statut: {
    type: String,
    enum: ['payée', 'non payée', 'en retard'],
    default: 'non payée'
  },
  numeroFacture: {
    type: String,
    unique: true,
    required: true
  },
  dateEmission: {
    type: Date,
    default: Date.now
  },
  dateEcheance: {
    type: Date,
    required: true
  },
  datePaiement: {
    type: Date,
    default: null
  },
  details: {
    kwh: Number,
    prixKwh: {
      type: Number,
      default: 0.1740
    },
    fraisFixes: {
      type: Number,
      default: 0
    }
  },
  commentaire: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});


factureSchema.statics.genererNumeroFacture = async function() {
  const date = new Date();
  const annee = date.getFullYear();
  const mois = String(date.getMonth() + 1).padStart(2, '0');
  
  
  const count = await this.countDocuments({
    dateEmission: {
      $gte: new Date(annee, date.getMonth(), 1),
      $lt: new Date(annee, date.getMonth() + 1, 1)
    }
  });
  
  return `FACT-${annee}${mois}-${String(count + 1).padStart(4, '0')}`;
};


factureSchema.methods.marquerPayee = function() {
  this.statut = 'payée';
  this.datePaiement = new Date();
  return this.save();
};


factureSchema.methods.verifierRetard = function() {
  if (this.statut === 'non payée' && this.dateEcheance < new Date()) {
    this.statut = 'en retard';
    return this.save();
  }
  return Promise.resolve(this);
};


factureSchema.methods.joursRetard = function() {
  if (this.statut === 'payée' || this.dateEcheance >= new Date()) {
    return 0;
  }
  const diffTime = new Date() - this.dateEcheance;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};


factureSchema.set('toJSON', {
  virtuals: true
});


factureSchema.index({ residentId: 1, dateEmission: -1 });
factureSchema.index({ maisonId: 1, dateEmission: -1 });
factureSchema.index({ statut: 1, dateEcheance: 1 });

module.exports = mongoose.model('Facture', factureSchema);

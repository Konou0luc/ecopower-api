const mongoose = require('mongoose');

const consommationSchema = new mongoose.Schema({
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
  previousIndex: {
    type: Number,
    required: true,
    min: 0
  },
  currentIndex: {
    type: Number,
    required: true,
    min: 0
  },
  kwh: {
    type: Number,
    required: true,
    min: 0
  },
  montant: {
    type: Number,
    required: true,
    min: 0
  },
  mois: {
    type: Number,
    required: true,
    min: 1,
    max: 12
  },
  annee: {
    type: Number,
    required: true,
    min: 2025
  },
  dateReleve: {
    type: Date,
    default: Date.now
  },
  commentaire: {
    type: String,
    trim: true
  },
  statut: {
    type: String,
    enum: ['enregistree', 'facturee'],
    default: 'enregistree'
  }
}, {
  timestamps: true
});


consommationSchema.virtual('periode').get(function () {
  const mois = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];
  return `${mois[this.mois - 1]} ${this.annee}`;
});


consommationSchema.set('toJSON', { virtuals: true });


consommationSchema.index({
  residentId: 1,
  maisonId: 1,
  mois: 1,
  annee: 1
});


consommationSchema.index({ residentId: 1, annee: 1, mois: 1 });
consommationSchema.index({ maisonId: 1, annee: 1, mois: 1 });

module.exports = mongoose.model('Consommation', consommationSchema);

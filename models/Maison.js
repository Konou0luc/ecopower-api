const mongoose = require('mongoose');

const maisonSchema = new mongoose.Schema({
  nomMaison: {
    type: String,
    required: true,
    trim: true
  },
  proprietaireId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  listeResidents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  adresse: {
    rue: String,
    ville: String,
    codePostal: String,
    pays: {
      type: String,
      default: 'Togo'
    }
  },
  description: {
    type: String,
    trim: true
  },
  tarifKwh: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  nbResidentsMax: {
    type: Number,
    required: true,
    default: 1,
    min: 1
  },
  statut: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  }
}, {
  timestamps: true
});


maisonSchema.methods.ajouterResident = function(residentId) {
  if (!this.listeResidents) {
    this.listeResidents = [];
  }
  if (!this.listeResidents.includes(residentId)) {
    this.listeResidents.push(residentId);
    return this.save();
  }
  return Promise.resolve(this);
};


maisonSchema.methods.retirerResident = function(residentId) {
  if (!this.listeResidents) {
    this.listeResidents = [];
  }
  this.listeResidents = this.listeResidents.filter(id => !id.equals(residentId));
  return this.save();
};


maisonSchema.virtual('nbResidents').get(function() {
  return this.listeResidents ? this.listeResidents.length : 0;
});


maisonSchema.set('toJSON', {
  virtuals: true
});


maisonSchema.index({ proprietaireId: 1 });
maisonSchema.index({ listeResidents: 1 });

module.exports = mongoose.model('Maison', maisonSchema);

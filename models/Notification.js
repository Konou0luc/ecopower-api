const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  titre: {
    type: String,
    required: true,
    trim: true
  },
  contenu: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['system', 'alert', 'info', 'warning', 'success'],
    default: 'info'
  },
  statut: {
    type: String,
    enum: ['envoye', 'en_attente', 'echec', 'lu'],
    default: 'en_attente'
  },
  destinataire: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  dateEnvoi: {
    type: Date,
    default: Date.now
  },
  dateLecture: {
    type: Date
  },
  priorite: {
    type: String,
    enum: ['basse', 'normale', 'haute', 'critique'],
    default: 'normale'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});


notificationSchema.index({ destinataire: 1, createdAt: -1 });
notificationSchema.index({ statut: 1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ priorite: 1 });

module.exports = mongoose.model('Notification', notificationSchema);


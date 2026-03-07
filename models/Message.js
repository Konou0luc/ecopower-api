const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sujet: {
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
    enum: ['email', 'sms', 'push', 'chat'],
    default: 'email'
  },
  statut: {
    type: String,
    enum: ['envoye', 'en_attente', 'echec', 'lu'],
    default: 'en_attente'
  },
  expediteur: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});


messageSchema.index({ expediteur: 1, createdAt: -1 });
messageSchema.index({ destinataire: 1, createdAt: -1 });
messageSchema.index({ statut: 1 });
messageSchema.index({ type: 1 });

module.exports = mongoose.model('Message', messageSchema);
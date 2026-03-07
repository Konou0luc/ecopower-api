const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  level: {
    type: String,
    enum: ['debug', 'info', 'warn', 'error', 'fatal'],
    required: true
  },
  message: {
    type: String,
    required: true
  },
  module: {
    type: String,
    required: true
  },
  action: {
    type: String,
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  ip: {
    type: String
  },
  userAgent: {
    type: String
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  stack: {
    type: String
  }
}, {
  timestamps: true
});


logSchema.index({ level: 1, createdAt: -1 });
logSchema.index({ module: 1, createdAt: -1 });
logSchema.index({ user: 1, createdAt: -1 });
logSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Log', logSchema);


const mongoose = require('mongoose');

const appSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      unique: true,
      default: 'contact',
    },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    website: { type: String, default: '' },
    description: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AppSettings', appSettingsSchema);

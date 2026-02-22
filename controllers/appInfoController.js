const AppSettings = require('../models/AppSettings');

/**
 * Récupère les infos de contact (public - pas d'auth).
 * Priorité : DB > variables d'environnement.
 */
const getAppInfo = async (req, res) => {
  try {
    const settings = await AppSettings.findOne({ key: 'contact' });
    const data = settings
      ? {
          email: settings.email || '',
          phone: settings.phone || '',
          website: settings.website || '',
          description: settings.description || '',
        }
      : { email: '', phone: '', website: '', description: '' };
    res.json(data);
  } catch (error) {
    console.error('Erreur getAppInfo:', error);
    res.json({ email: '', phone: '', website: '', description: '' });
  }
};

module.exports = { getAppInfo };

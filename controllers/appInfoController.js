const AppSettings = require('../models/AppSettings');


const getAppInfo = async (req, res) => {
  try {
    const settings = await AppSettings.findOne({ key: 'contact' });
    const data = settings
      ? {
          email: settings.email || '',
          phone: settings.phone || '',
          website: settings.website || '',
          description: settings.description || '',
          guideRapideUrl: settings.guideRapideUrl || '',
          privacyPolicyUrl: settings.privacyPolicyUrl || '',
        }
      : {
          email: '',
          phone: '',
          website: '',
          description: '',
          guideRapideUrl: '',
          privacyPolicyUrl: '',
        };
    res.json(data);
  } catch (error) {
    console.error('Erreur getAppInfo:', error);
    res.json({
      email: '',
      phone: '',
      website: '',
      description: '',
      guideRapideUrl: '',
      privacyPolicyUrl: '',
    });
  }
};

module.exports = { getAppInfo };

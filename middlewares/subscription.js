const Abonnement = require('../models/Abonnement');
const FREE_MODE = process.env.FREE_MODE === 'true';


const checkSubscription = async (req, res, next) => {
  try {
    if (FREE_MODE) {
      return next();
    }
    
    if (req.user.role !== 'proprietaire') {
      return next();
    }

    if (!req.user.abonnementId) {
      return res.status(403).json({ 
        message: 'Abonnement requis',
        error: 'NO_SUBSCRIPTION',
        redirectTo: '/subscription'
      });
    }

    const abonnement = await Abonnement.findById(req.user.abonnementId);
    if (!abonnement) {
      return res.status(404).json({ 
        message: 'Abonnement non trouvé',
        error: 'SUBSCRIPTION_NOT_FOUND',
        redirectTo: '/subscription'
      });
    }

    
    const isActif = abonnement.isActif();
    await abonnement.save();

    if (!isActif) {
      return res.status(403).json({ 
        message: 'Votre abonnement est expiré. Veuillez le renouveler pour continuer.',
        error: 'SUBSCRIPTION_EXPIRED',
        abonnement: abonnement,
        redirectTo: '/subscription'
      });
    }

    
    req.abonnement = abonnement;
    next();
  } catch (error) {
    console.error('Erreur lors de la vérification de l\'abonnement:', error);
    res.status(500).json({ message: 'Erreur lors de la vérification de l\'abonnement' });
  }
};


const checkSubscriptionInfo = async (req, res, next) => {
  try {
    if (FREE_MODE) {
      return next();
    }
    if (req.user.role !== 'proprietaire') {
      return next();
    }

    if (!req.user.abonnementId) {
      req.subscriptionStatus = 'NO_SUBSCRIPTION';
      return next();
    }

    const abonnement = await Abonnement.findById(req.user.abonnementId);
    if (!abonnement) {
      req.subscriptionStatus = 'NOT_FOUND';
      return next();
    }

    
    const isActif = abonnement.isActif();
    await abonnement.save();

    req.abonnement = abonnement;
    req.subscriptionStatus = isActif ? 'ACTIVE' : 'EXPIRED';
    next();
  } catch (error) {
    console.error('Erreur lors de la vérification de l\'abonnement:', error);
    req.subscriptionStatus = 'ERROR';
    next();
  }
};

module.exports = {
  checkSubscription,
  checkSubscriptionInfo
};

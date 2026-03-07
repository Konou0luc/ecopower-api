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
        message: 'Aucun abonnement actif',
        error: 'NO_SUBSCRIPTION'
      });
    }

    
    const abonnement = await Abonnement.findById(req.user.abonnementId);
    
    if (!abonnement) {
      return res.status(403).json({ 
        message: 'Abonnement non trouvé',
        error: 'SUBSCRIPTION_NOT_FOUND'
      });
    }

    
    if (!abonnement.isActive || !abonnement.isActif()) {
      return res.status(403).json({ 
        message: 'Abonnement expiré',
        error: !abonnement.isActive ? 'NO_SUBSCRIPTION' : 'SUBSCRIPTION_EXPIRED',
        dateExpiration: abonnement.dateFin,
        joursRestants: abonnement.joursRestants()
      });
    }

    
    req.abonnement = abonnement;
    next();
  } catch (error) {
    console.error('Erreur lors de la vérification de l\'abonnement:', error);
    return res.status(500).json({ 
      message: 'Erreur lors de la vérification de l\'abonnement' 
    });
  }
};


const checkResidentQuota = async (req, res, next) => {
  try {
    if (FREE_MODE) {
      return next();
    }
    if (!req.abonnement) {
      return res.status(403).json({ 
        message: 'Abonnement requis pour cette opération' 
      });
    }

    
    const User = require('../models/User');
    const nbResidentsActuels = await User.countDocuments({
      idProprietaire: req.user._id,
      role: 'resident'
    });

    
    if (nbResidentsActuels >= req.abonnement.nbResidentsMax) {
      return res.status(403).json({ 
        message: `Quota de résidents atteint (${req.abonnement.nbResidentsMax} maximum)`,
        error: 'QUOTA_EXCEEDED',
        quotaActuel: nbResidentsActuels,
        quotaMaximum: req.abonnement.nbResidentsMax
      });
    }

    req.nbResidentsActuels = nbResidentsActuels;
    next();
  } catch (error) {
    console.error('Erreur lors de la vérification du quota:', error);
    return res.status(500).json({ 
      message: 'Erreur lors de la vérification du quota' 
    });
  }
};


const checkSubscriptionExpiry = async (req, res, next) => {
  try {
    if (FREE_MODE) {
      return next();
    }
    if (!req.abonnement) {
      return next();
    }

    const joursRestants = req.abonnement.joursRestants();
    
    if (joursRestants <= 7 && joursRestants > 0) {
      
      res.locals.subscriptionWarning = {
        message: `Votre abonnement expire dans ${joursRestants} jour(s)`,
        joursRestants,
        dateExpiration: req.abonnement.dateFin
      };
    }

    next();
  } catch (error) {
    console.error('Erreur lors de la vérification de l\'expiration:', error);
    next(); 
  }
};

module.exports = {
  checkSubscription,
  checkResidentQuota,
  checkSubscriptionExpiry
};

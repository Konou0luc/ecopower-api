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
    const defaultNbResidentsParMaison = 2; // For FREE_MODE
    const limit = (FREE_MODE || !req.abonnement) ? defaultNbResidentsParMaison : req.abonnement.nbResidentsParMaisonMax;

    if (FREE_MODE) {
      // In free mode, we still need to check the quota for the house
    } else if (!req.abonnement) {
      return res.status(403).json({ 
        message: 'Abonnement requis pour cette opération' 
      });
    }

    const { maisonId } = req.body;
    if (!maisonId) {
      return res.status(400).json({ message: 'maisonId requis pour vérifier le quota de résidents' });
    }

    const Maison = require('../models/Maison');
    const maison = await Maison.findById(maisonId);
    
    if (!maison) {
      return res.status(404).json({ message: 'Maison non trouvée' });
    }

    const nbResidentsActuels = maison.listeResidents.length;

    if (nbResidentsActuels >= limit) {
      return res.status(403).json({ 
        message: `Quota de résidents atteint pour cette maison (${limit} maximum)`,
        error: 'QUOTA_EXCEEDED',
        quotaActuel: nbResidentsActuels,
        quotaMaximum: limit
      });
    }

    req.nbResidentsActuels = nbResidentsActuels;
    next();
  } catch (error) {
    console.error('Erreur lors de la vérification du quota de résidents:', error);
    return res.status(500).json({ 
      message: 'Erreur lors de la vérification du quota de résidents' 
    });
  }
};

const checkMaisonQuota = async (req, res, next) => {
  try {
    const defaultNbMaisonsMax = 1; // For FREE_MODE
    const limit = (FREE_MODE || !req.abonnement) ? defaultNbMaisonsMax : req.abonnement.nbMaisonsMax;

    if (FREE_MODE) {
      // In free mode, we still need to check the quota for the house
    } else if (!req.abonnement) {
      return res.status(403).json({ 
        message: 'Abonnement requis pour cette opération' 
      });
    }

    const Maison = require('../models/Maison');
    const nbMaisonsActuelles = await Maison.countDocuments({
      proprietaireId: req.user._id
    });

    if (nbMaisonsActuelles >= limit) {
      return res.status(403).json({ 
        message: `Quota de maisons atteint (${limit} maximum)`,
        error: 'QUOTA_EXCEEDED',
        quotaActuel: nbMaisonsActuelles,
        quotaMaximum: limit
      });
    }

    req.nbMaisonsActuelles = nbMaisonsActuelles;
    next();
  } catch (error) {
    console.error('Erreur lors de la vérification du quota de maisons:', error);
    return res.status(500).json({ 
      message: 'Erreur lors de la vérification du quota de maisons' 
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
  checkMaisonQuota,
  checkSubscriptionExpiry
};

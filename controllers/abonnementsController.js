const Abonnement = require('../models/Abonnement');
const User = require('../models/User');
const { sendSubscriptionExpiryNotification } = require('../utils/whatsappUtils');


const getOffres = async (req, res) => {
  try {
    const offres = [
      {
        type: 'basic',
        nom: 'Basic',
        prix: 500,
        nbResidentsMax: 5,
        description: 'Idéal pour les petites propriétés',
        fonctionnalites: [
          'Gestion jusqu\'à 5 résidents',
          'Génération de factures',
          'Historique des consommations',
          'Notifications WhatsApp'
        ]
      },
      {
        type: 'premium',
        nom: 'Premium',
        prix: 1000,
        nbResidentsMax: 15,
        description: 'Parfait pour les propriétés moyennes',
        fonctionnalites: [
          'Gestion jusqu\'à 15 résidents',
          'Génération de factures',
          'Historique des consommations',
          'Notifications WhatsApp',
          'Statistiques avancées',
          'Support prioritaire'
        ]
      },
      {
        type: 'enterprise',
        nom: 'Enterprise',
        prix: 2000,
        nbResidentsMax: 50,
        description: 'Pour les grandes propriétés',
        fonctionnalites: [
          'Gestion jusqu\'à 50 résidents',
          'Génération de factures',
          'Historique des consommations',
          'Notifications WhatsApp',
          'Statistiques avancées',
          'Support prioritaire',
          'API personnalisée',
          'Formation incluse'
        ]
      }
    ];

    res.json({ offres });
  } catch (error) {
    console.error('Erreur lors de la récupération des offres:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des offres' });
  }
};


const souscrire = async (req, res) => {
  try {
    const { type } = req.body;

    
    if (req.user.role !== 'proprietaire') {
      return res.status(403).json({ message: 'Seuls les propriétaires peuvent souscrire à un abonnement' });
    }

    
    if (req.user.abonnementId) {
      const existingAbonnement = await Abonnement.findById(req.user.abonnementId);
      if (existingAbonnement && existingAbonnement.isActif()) {
        return res.status(400).json({ 
          message: 'Vous avez déjà un abonnement actif',
          abonnement: existingAbonnement
        });
      }
      
      if (existingAbonnement && !existingAbonnement.isActif()) {
        
        await Abonnement.findByIdAndDelete(existingAbonnement._id);
        req.user.abonnementId = null;
        await req.user.save();
      }
    }

    
    const offres = {
      basic: { prix: 500, nbResidentsMax: 5 },
      premium: { prix: 1000, nbResidentsMax: 15 },
      enterprise: { prix: 2000, nbResidentsMax: 50 }
    };

    const offre = offres[type];
    if (!offre) {
      return res.status(400).json({ message: 'Type d\'abonnement invalide' });
    }

    
    const dateDebut = new Date();
    const dateFin = new Date();
    dateFin.setMonth(dateFin.getMonth() + 1);

    
    const abonnement = new Abonnement({
      type,
      prix: offre.prix,
      nbResidentsMax: offre.nbResidentsMax,
      dateDebut,
      dateFin,
      statut: 'actif',
      isActive: false,
      proprietaireId: req.user._id
    });

    await abonnement.save();

    
    req.user.abonnementId = abonnement._id;
    await req.user.save();

    res.status(201).json({
      message: 'Abonnement souscrit avec succès',
      abonnement
    });
  } catch (error) {
    console.error('Erreur lors de la souscription:', error);
    res.status(500).json({ message: 'Erreur lors de la souscription' });
  }
};

const FREE_MODE = process.env.FREE_MODE === 'true';


const renouveler = async (req, res) => {
  try {
    if (FREE_MODE) {
      const now = new Date();
      const future = new Date(now);
      future.setFullYear(future.getFullYear() + 5);
      return res.json({
        message: 'Mode gratuit: abonnement considéré actif',
        abonnement: {
          statut: 'actif',
          isActive: true,
          dateDebut: now,
          dateFin: future,
          nbResidentsMax: 9999,
        },
        success: true,
      });
    }
    console.log('🔄 [API] Début du renouvellement d\'abonnement pour:', req.user._id);
    
    
    if (req.user.role !== 'proprietaire') {
      return res.status(403).json({ message: 'Seuls les propriétaires peuvent renouveler un abonnement' });
    }

    
    if (!req.user.abonnementId) {
      return res.status(400).json({ message: 'Aucun abonnement à renouveler' });
    }

    const abonnement = await Abonnement.findById(req.user.abonnementId);
    if (!abonnement) {
      return res.status(404).json({ message: 'Abonnement non trouvé' });
    }

    console.log('📅 [API] Abonnement actuel:', {
      id: abonnement._id,
      type: abonnement.type,
      dateDebut: abonnement.dateDebut,
      dateFin: abonnement.dateFin,
      statut: abonnement.statut,
      isActive: abonnement.isActive
    });

    
    await abonnement.renouveler();

    
    const abonnementRenouvele = await Abonnement.findById(req.user.abonnementId);

    console.log('✅ [API] Abonnement renouvelé:', {
      id: abonnementRenouvele._id,
      type: abonnementRenouvele.type,
      dateDebut: abonnementRenouvele.dateDebut,
      dateFin: abonnementRenouvele.dateFin,
      statut: abonnementRenouvele.statut,
      isActive: abonnementRenouvele.isActive
    });

    res.json({
      message: 'Abonnement renouvelé avec succès',
      abonnement: abonnementRenouvele,
      success: true
    });
  } catch (error) {
    console.error('💥 [API] Erreur lors du renouvellement:', error);
    res.status(500).json({ 
      message: 'Erreur lors du renouvellement',
      error: error.message,
      success: false
    });
  }
};


const getAbonnementActuel = async (req, res) => {
  try {
    
    if (req.user.role !== 'proprietaire') {
      return res.status(403).json({ message: 'Seuls les propriétaires peuvent consulter leur abonnement' });
    }

    if (!req.user.abonnementId) {
      return res.status(404).json({ message: 'Aucun abonnement trouvé' });
    }

    const abonnement = await Abonnement.findById(req.user.abonnementId);
    if (!abonnement) {
      return res.status(404).json({ message: 'Abonnement non trouvé' });
    }

    
    const isActif = abonnement.isActif();
    
    
    await abonnement.save();

    
    const nbResidentsActuels = await User.countDocuments({
      idProprietaire: req.user._id,
      role: 'resident'
    });

    res.json({
      abonnement,
      statistiques: {
        nbResidentsActuels,
        nbResidentsMax: abonnement.nbResidentsMax,
        joursRestants: abonnement.joursRestants(),
        isActif: isActif
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'abonnement:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération de l\'abonnement' });
  }
};


const annuler = async (req, res) => {
  try {
    
    if (req.user.role !== 'proprietaire') {
      return res.status(403).json({ message: 'Seuls les propriétaires peuvent annuler un abonnement' });
    }

    if (!req.user.abonnementId) {
      return res.status(400).json({ message: 'Aucun abonnement à annuler' });
    }

    const abonnement = await Abonnement.findById(req.user.abonnementId);
    if (!abonnement) {
      return res.status(404).json({ message: 'Abonnement non trouvé' });
    }

    
    abonnement.statut = 'suspendu';
    await abonnement.save();

    
    req.user.abonnementId = null;
    await req.user.save();

    res.json({
      message: 'Abonnement annulé avec succès',
      abonnement
    });
  } catch (error) {
    console.error('Erreur lors de l\'annulation:', error);
    res.status(500).json({ message: 'Erreur lors de l\'annulation' });
  }
};



const activer = async (req, res) => {
  try {
    const { id } = req.params;

    const abonnement = await Abonnement.findById(id);
    if (!abonnement) {
      return res.status(404).json({ message: 'Abonnement non trouvé' });
    }

    abonnement.isActive = true;
    await abonnement.save();

    res.json({ message: 'Abonnement activé', abonnement });
  } catch (error) {
    console.error('Erreur lors de l\'activation:', error);
    res.status(500).json({ message: 'Erreur lors de l\'activation' });
  }
};


const desactiver = async (req, res) => {
  try {
    const { id } = req.params;

    const abonnement = await Abonnement.findById(id);
    if (!abonnement) {
      return res.status(404).json({ message: 'Abonnement non trouvé' });
    }

    abonnement.isActive = false;
    await abonnement.save();

    res.json({ message: 'Abonnement désactivé', abonnement });
  } catch (error) {
    console.error('Erreur lors de la désactivation:', error);
    res.status(500).json({ message: 'Erreur lors de la désactivation' });
  }
};


const getHistorique = async (req, res) => {
  try {
    
    if (req.user.role !== 'proprietaire') {
      return res.status(403).json({ message: 'Seuls les propriétaires peuvent consulter l\'historique' });
    }

    const abonnements = await Abonnement.find({ proprietaireId: req.user._id })
      .sort({ dateDebut: -1 });

    res.json({
      abonnements,
      total: abonnements.length
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'historique:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération de l\'historique' });
  }
};

module.exports = {
  getOffres,
  souscrire,
  renouveler,
  getAbonnementActuel,
  annuler,
  getHistorique,
  activer,
  desactiver
};

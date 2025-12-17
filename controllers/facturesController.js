const Facture = require('../models/Facture');
const Consommation = require('../models/Consommation');
const User = require('../models/User');
const Maison = require('../models/Maison');
const { sendFactureNotification } = require('../utils/whatsappUtils');
const notifications = require('../utils/notifications');

// Générer une facture pour un résident
const generateFacture = async (req, res) => {
  try {
    const { residentId } = req.params;
    const { mois, annee, fraisFixes = 0 } = req.body;

    // Vérifier que l'utilisateur est autorisé
    if (req.user.role === 'proprietaire') {
      const resident = await User.findOne({
        _id: residentId,
        idProprietaire: req.user._id,
        role: 'resident'
      });

      if (!resident) {
        return res.status(404).json({ message: 'Résident non trouvé' });
      }
    } else {
      if (residentId !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Accès non autorisé' });
      }
    }

    // Trouver la consommation pour cette période
    const consommation = await Consommation.findOne({
      residentId,
      mois: parseInt(mois),
      annee: parseInt(annee)
    });

    if (!consommation) {
      return res.status(404).json({ 
        message: 'Aucune consommation trouvée pour cette période' 
      });
    }

    // Vérifier si une facture existe déjà
    const existingFacture = await Facture.findOne({
      residentId,
      consommationId: consommation._id
    });

    if (existingFacture) {
      return res.status(400).json({ 
        message: 'Une facture existe déjà pour cette consommation',
        facture: existingFacture
      });
    }

    // Calculer le montant avec le tarif de la maison
    const maisonFact = await Maison.findById(consommation.maisonId);
    const tarif = maisonFact && typeof maisonFact.tarifKwh === 'number' ? maisonFact.tarifKwh : 0.1740;
    const montant = (consommation.kwh * tarif) + fraisFixes;

    // Générer le numéro de facture
    const numeroFacture = await Facture.genererNumeroFacture();

    // Calculer la date d'échéance (30 jours après émission)
    const dateEcheance = new Date();
    dateEcheance.setDate(dateEcheance.getDate() + 30);

    // Créer la facture
    const facture = new Facture({
      residentId,
      maisonId: consommation.maisonId,
      consommationId: consommation._id,
      montant,
      numeroFacture,
      dateEcheance,
      details: {
        kwh: consommation.kwh,
        prixKwh: tarif,
        fraisFixes
      }
    });

    await facture.save();

    // Marquer la consommation comme facturée
    consommation.statut = 'facturee';
    await consommation.save();

    // Envoyer notification WhatsApp au résident
    const resident = await User.findById(residentId);
    if (resident && resident.telephone) {
      await sendFactureNotification(
        resident.telephone,
        numeroFacture,
        montant,
        dateEcheance
      );
    }

    // Envoyer une notification FCM au résident uniquement si c'est le gérant qui génère la facture
    if (req.user.role === 'proprietaire') {
      try {
        const messageFacture = `Nouvelle facture ${numeroFacture}: ${montant.toFixed(2)} FCFA. Échéance: ${dateEcheance.toLocaleDateString('fr-FR')}`;
        await notifications.envoyer(residentId, messageFacture);
        console.log(`✅ Notification facture envoyée au résident ${residentId}`);
      } catch (e) {
        console.error('FCM facture erreur:', e?.message || e);
      }
    }

    res.status(201).json({
      message: 'Facture générée avec succès',
      facture: {
        ...facture.toObject(),
        consommation: {
          kwh: consommation.kwh,
          periode: consommation.periode
        }
      }
    });
  } catch (error) {
    console.error('Erreur lors de la génération de la facture:', error);
    res.status(500).json({ message: 'Erreur lors de la génération de la facture' });
  }
};

// Obtenir les factures d'un résident
const getFacturesByResident = async (req, res) => {
  try {
    const { residentId } = req.params;
    const { statut, annee } = req.query;

    // Vérifier les autorisations
    if (req.user.role === 'proprietaire') {
      const resident = await User.findOne({
        _id: residentId,
        idProprietaire: req.user._id,
        role: 'resident'
      });

      if (!resident) {
        return res.status(404).json({ message: 'Résident non trouvé' });
      }
    } else {
      if (residentId !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Accès non autorisé' });
      }
    }

    // Construire la requête
    const query = { residentId };
    if (statut) query.statut = statut;
    if (annee) {
      query.dateEmission = {
        $gte: new Date(parseInt(annee), 0, 1),
        $lt: new Date(parseInt(annee) + 1, 0, 1)
      };
    }

    const factures = await Facture.find(query)
      .populate('consommationId', 'kwh mois annee')
      .populate('maisonId', 'nomMaison')
      .sort({ dateEmission: -1 });

    // Calculer les statistiques
    const totalMontant = factures.reduce((sum, facture) => sum + facture.montant, 0);
    const facturesPayees = factures.filter(f => f.statut === 'payée');
    const totalPaye = facturesPayees.reduce((sum, facture) => sum + facture.montant, 0);
    const facturesEnRetard = factures.filter(f => f.statut === 'en retard');

    res.json({
      factures,
      statistiques: {
        totalFactures: factures.length,
        totalMontant,
        totalPaye,
        totalImpaye: totalMontant - totalPaye,
        facturesPayees: facturesPayees.length,
        facturesEnRetard: facturesEnRetard.length
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des factures:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des factures' });
  }
};

// Marquer une facture comme payée
const markFactureAsPaid = async (req, res) => {
  try {
    const { id } = req.params;

    // Trouver la facture
    const facture = await Facture.findById(id);
    if (!facture) {
      return res.status(404).json({ message: 'Facture non trouvée' });
    }

    // Vérifier les autorisations
    if (req.user.role === 'proprietaire') {
      const resident = await User.findOne({
        _id: facture.residentId,
        idProprietaire: req.user._id,
        role: 'resident'
      });

      if (!resident) {
        return res.status(403).json({ message: 'Accès non autorisé' });
      }
    } else {
      if (facture.residentId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Accès non autorisé' });
      }
    }

    // Marquer comme payée
    await facture.marquerPayee();

    res.json({
      message: 'Facture marquée comme payée',
      facture
    });
  } catch (error) {
    console.error('Erreur lors du marquage de la facture:', error);
    res.status(500).json({ message: 'Erreur lors du marquage de la facture' });
  }
};

// Obtenir une facture spécifique
const getFacture = async (req, res) => {
  try {
    const { id } = req.params;

    const facture = await Facture.findById(id)
      .populate('residentId', 'nom prenom email telephone')
      .populate('consommationId', 'kwh mois annee')
      .populate('maisonId', 'nomMaison');

    if (!facture) {
      return res.status(404).json({ message: 'Facture non trouvée' });
    }

    // Vérifier les autorisations
    if (req.user.role === 'proprietaire') {
      const resident = await User.findOne({
        _id: facture.residentId._id,
        idProprietaire: req.user._id,
        role: 'resident'
      });

      if (!resident) {
        return res.status(403).json({ message: 'Accès non autorisé' });
      }
    } else {
      if (facture.residentId._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Accès non autorisé' });
      }
    }

    res.json({ facture });
  } catch (error) {
    console.error('Erreur lors de la récupération de la facture:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération de la facture' });
  }
};

// Obtenir les factures d'une maison
const getFacturesByMaison = async (req, res) => {
  try {
    const { maisonId } = req.params;
    const { statut, annee } = req.query;

    // Vérifier que l'utilisateur a accès à cette maison
    let maison;
    if (req.user.role === 'proprietaire') {
      maison = await Maison.findOne({
        _id: maisonId,
        proprietaireId: req.user._id
      });
    } else {
      maison = await Maison.findOne({
        _id: maisonId,
        listeResidents: req.user._id
      });
    }

    if (!maison) {
      return res.status(404).json({ message: 'Maison non trouvée' });
    }

    // Construire la requête
    const query = { maisonId };
    if (statut) query.statut = statut;
    if (annee) {
      query.dateEmission = {
        $gte: new Date(parseInt(annee), 0, 1),
        $lt: new Date(parseInt(annee) + 1, 0, 1)
      };
    }

    const factures = await Facture.find(query)
      .populate('residentId', 'nom prenom')
      .populate('consommationId', 'kwh mois annee')
      .sort({ dateEmission: -1 });

    // Calculer les statistiques par résident
    const statsParResident = {};
    factures.forEach(facture => {
      const residentId = facture.residentId._id.toString();
      if (!statsParResident[residentId]) {
        statsParResident[residentId] = {
          resident: facture.residentId,
          totalFactures: 0,
          totalMontant: 0,
          totalPaye: 0,
          facturesEnRetard: 0
        };
      }
      statsParResident[residentId].totalFactures += 1;
      statsParResident[residentId].totalMontant += facture.montant;
      if (facture.statut === 'payée') {
        statsParResident[residentId].totalPaye += facture.montant;
      }
      if (facture.statut === 'en retard') {
        statsParResident[residentId].facturesEnRetard += 1;
      }
    });

    res.json({
      factures,
      statistiquesParResident: Object.values(statsParResident),
      maison: {
        _id: maison._id,
        nomMaison: maison.nomMaison
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des factures:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des factures' });
  }
};

// ===== NOUVELLES FONCTIONS POUR LES RÉSIDENTS =====

// Obtenir les factures du résident connecté (sans passer par l'ID dans l'URL)
const getMyFactures = async (req, res) => {
  try {
    // Vérifier que l'utilisateur est un résident
    if (req.user.role !== 'resident') {
      return res.status(403).json({ message: 'Accès non autorisé - Résident requis' });
    }

    const { statut, annee } = req.query;

    // Construire la requête pour le résident connecté
    const query = { residentId: req.user._id };
    if (statut) query.statut = statut;
    if (annee) {
      query.dateEmission = {
        $gte: new Date(parseInt(annee), 0, 1),
        $lt: new Date(parseInt(annee) + 1, 0, 1)
      };
    }

    const factures = await Facture.find(query)
      .populate('consommationId', 'kwh mois annee')
      .populate('maisonId', 'nomMaison adresse')
      .sort({ dateEmission: -1 });

    // Calculer les statistiques
    const totalMontant = factures.reduce((sum, facture) => sum + facture.montant, 0);
    const facturesPayees = factures.filter(f => f.statut === 'payée');
    const totalPaye = facturesPayees.reduce((sum, facture) => sum + facture.montant, 0);
    const facturesEnRetard = factures.filter(f => f.statut === 'en retard');

    res.json({
      factures,
      statistiques: {
        totalFactures: factures.length,
        totalMontant,
        totalPaye,
        totalImpaye: totalMontant - totalPaye,
        facturesPayees: facturesPayees.length,
        facturesEnRetard: facturesEnRetard.length
      },
      message: 'Factures récupérées avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des factures du résident:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des factures' });
  }
};

// Obtenir les factures de la maison du résident connecté
const getMyMaisonFactures = async (req, res) => {
  try {
    // Vérifier que l'utilisateur est un résident
    if (req.user.role !== 'resident') {
      return res.status(403).json({ message: 'Accès non autorisé - Résident requis' });
    }

    // Récupérer la maison du résident
    const maison = await Maison.findOne({
      listeResidents: req.user._id
    });

    if (!maison) {
      return res.status(404).json({ message: 'Aucune maison trouvée pour ce résident' });
    }

    const { statut, annee } = req.query;

    // Construire la requête pour la maison du résident
    const query = { maisonId: maison._id };
    if (statut) query.statut = statut;
    if (annee) {
      query.dateEmission = {
        $gte: new Date(parseInt(annee), 0, 1),
        $lt: new Date(parseInt(annee) + 1, 0, 1)
      };
    }

    const factures = await Facture.find(query)
      .populate('residentId', 'nom prenom')
      .populate('consommationId', 'kwh mois annee')
      .sort({ dateEmission: -1 });

    // Calculer les statistiques par résident
    const statsParResident = {};
    factures.forEach(facture => {
      const residentId = facture.residentId._id.toString();
      if (!statsParResident[residentId]) {
        statsParResident[residentId] = {
          resident: facture.residentId,
          totalFactures: 0,
          totalMontant: 0,
          totalPaye: 0,
          facturesEnRetard: 0
        };
      }
      statsParResident[residentId].totalFactures += 1;
      statsParResident[residentId].totalMontant += facture.montant;
      if (facture.statut === 'payée') {
        statsParResident[residentId].totalPaye += facture.montant;
      }
      if (facture.statut === 'en retard') {
        statsParResident[residentId].facturesEnRetard += 1;
      }
    });

    res.json({
      factures,
      statistiquesParResident: Object.values(statsParResident),
      maison: {
        _id: maison._id,
        nomMaison: maison.nomMaison,
        adresse: maison.adresse
      },
      message: 'Factures de la maison récupérées avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des factures de la maison:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des factures de la maison' });
  }
};

module.exports = {
  generateFacture,
  getFacturesByResident,
  markFactureAsPaid,
  getFacture,
  getFacturesByMaison,
  // Nouvelles fonctions pour les résidents
  getMyFactures,
  getMyMaisonFactures
};

const User = require('../models/User');
const Maison = require('../models/Maison');
const Consommation = require('../models/Consommation');
const Facture = require('../models/Facture');
const Abonnement = require('../models/Abonnement');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const Log = require('../models/Log');

// Dashboard - Statistiques générales
const getDashboardStats = async (req, res) => {
  try {
    // Compter les utilisateurs par rôle
    const totalUsers = await User.countDocuments();
    const totalProprietaires = await User.countDocuments({ role: 'proprietaire' });
    const totalResidents = await User.countDocuments({ role: 'resident' });
    const totalAdmins = await User.countDocuments({ role: 'admin' });

    // Compter les maisons
    const totalMaisons = await Maison.countDocuments();

    // Statistiques des consommations
    const totalConsommations = await Consommation.countDocuments();
    const totalKwh = await Consommation.aggregate([
      { $group: { _id: null, total: { $sum: '$kwh' } } }
    ]);
    const totalMontantConsommations = await Consommation.aggregate([
      { $group: { _id: null, total: { $sum: '$montant' } } }
    ]);

    // Statistiques des factures
    const totalFactures = await Facture.countDocuments();
    const facturesPayees = await Facture.countDocuments({ statut: 'payée' });
    const facturesEnRetard = await Facture.countDocuments({ statut: 'en retard' });
    const facturesEnAttente = await Facture.countDocuments({ statut: 'en attente' });

    // Revenus totaux
    const revenusTotaux = await Facture.aggregate([
      { $match: { statut: 'payée' } },
      { $group: { _id: null, total: { $sum: '$montant' } } }
    ]);

    // Consommations des 6 derniers mois
    const sixMoisAgo = new Date();
    sixMoisAgo.setMonth(sixMoisAgo.getMonth() - 6);
    
    const consommationsRecentes = await Consommation.aggregate([
      { $match: { createdAt: { $gte: sixMoisAgo } } },
      {
        $group: {
          _id: {
            annee: '$annee',
            mois: '$mois'
          },
          totalKwh: { $sum: '$kwh' },
          totalMontant: { $sum: '$montant' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.annee': 1, '_id.mois': 1 } }
    ]);

    // Factures des 6 derniers mois
    const facturesRecentes = await Facture.aggregate([
      { $match: { dateEmission: { $gte: sixMoisAgo } } },
      {
        $group: {
          _id: {
            annee: { $year: '$dateEmission' },
            mois: { $month: '$dateEmission' }
          },
          totalMontant: { $sum: '$montant' },
          count: { $sum: 1 },
          payees: {
            $sum: { $cond: [{ $eq: ['$statut', 'payée'] }, 1, 0] }
          }
        }
      },
      { $sort: { '_id.annee': 1, '_id.mois': 1 } }
    ]);

    // Top 5 des maisons les plus consommatrices
    const topMaisons = await Consommation.aggregate([
      {
        $group: {
          _id: '$maisonId',
          totalKwh: { $sum: '$kwh' },
          totalMontant: { $sum: '$montant' },
          count: { $sum: 1 }
        }
      },
      { $sort: { totalKwh: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'maisons',
          localField: '_id',
          foreignField: '_id',
          as: 'maison'
        }
      },
      { $unwind: '$maison' }
    ]);

    res.json({
      utilisateurs: {
        total: totalUsers,
        proprietaires: totalProprietaires,
        residents: totalResidents,
        admins: totalAdmins
      },
      maisons: {
        total: totalMaisons
      },
      consommations: {
        total: totalConsommations,
        totalKwh: totalKwh[0]?.total || 0,
        totalMontant: totalMontantConsommations[0]?.total || 0
      },
      factures: {
        total: totalFactures,
        payees: facturesPayees,
        enRetard: facturesEnRetard,
        enAttente: facturesEnAttente,
        revenusTotaux: revenusTotaux[0]?.total || 0
      },
      graphiques: {
        consommationsParMois: consommationsRecentes,
        facturesParMois: facturesRecentes,
        topMaisons
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques dashboard:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des statistiques' });
  }
};

// Obtenir tous les utilisateurs (admin)
const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, role, search } = req.query;
    const skip = (page - 1) * limit;

    // Construire la requête
    const query = {};
    if (role) query.role = role;
    if (search) {
      query.$or = [
        { nom: { $regex: search, $options: 'i' } },
        { prenom: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select('-motDePasse -refreshToken')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des utilisateurs:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des utilisateurs' });
  }
};

// Obtenir toutes les maisons (admin)
const getAllMaisons = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const skip = (page - 1) * limit;

    // Construire la requête
    const query = {};
    if (search) {
      query.$or = [
        { nomMaison: { $regex: search, $options: 'i' } },
        { adresse: { $regex: search, $options: 'i' } }
      ];
    }

    const maisons = await Maison.find(query)
      .populate('proprietaireId', 'nom prenom email')
      .populate('listeResidents', 'nom prenom email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Maison.countDocuments(query);

    res.json({
      maisons,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des maisons:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des maisons' });
  }
};

// Obtenir toutes les consommations (admin)
const getAllConsommations = async (req, res) => {
  try {
    const { page = 1, limit = 10, annee, mois, maisonId } = req.query;
    const skip = (page - 1) * limit;

    // Construire la requête
    const query = {};
    if (annee) query.annee = parseInt(annee);
    if (mois) query.mois = parseInt(mois);
    if (maisonId) query.maisonId = maisonId;

    const consommations = await Consommation.find(query)
      .populate('residentId', 'nom prenom email')
      .populate('maisonId', 'nomMaison adresse')
      .sort({ annee: -1, mois: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Consommation.countDocuments(query);

    // Statistiques
    const stats = await Consommation.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalKwh: { $sum: '$kwh' },
          totalMontant: { $sum: '$montant' },
          moyenneKwh: { $avg: '$kwh' },
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      consommations,
      statistiques: stats[0] || { totalKwh: 0, totalMontant: 0, moyenneKwh: 0, count: 0 },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des consommations:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des consommations' });
  }
};

// Obtenir toutes les factures (admin)
const getAllFactures = async (req, res) => {
  try {
    const { page = 1, limit = 10, statut, annee, maisonId } = req.query;
    const skip = (page - 1) * limit;

    // Construire la requête
    const query = {};
    if (statut) query.statut = statut;
    if (maisonId) query.maisonId = maisonId;
    if (annee) {
      query.dateEmission = {
        $gte: new Date(parseInt(annee), 0, 1),
        $lt: new Date(parseInt(annee) + 1, 0, 1)
      };
    }

    const factures = await Facture.find(query)
      .populate('residentId', 'nom prenom email')
      .populate('maisonId', 'nomMaison adresse')
      .populate('consommationId', 'kwh mois annee')
      .sort({ dateEmission: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Facture.countDocuments(query);

    // Statistiques
    const stats = await Facture.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalMontant: { $sum: '$montant' },
          totalPaye: {
            $sum: { $cond: [{ $eq: ['$statut', 'payée'] }, '$montant', 0] }
          },
          totalImpaye: {
            $sum: { $cond: [{ $ne: ['$statut', 'payée'] }, '$montant', 0] }
          },
          count: { $sum: 1 },
          payees: { $sum: { $cond: [{ $eq: ['$statut', 'payée'] }, 1, 0] } },
          enRetard: { $sum: { $cond: [{ $eq: ['$statut', 'en retard'] }, 1, 0] } }
        }
      }
    ]);

    res.json({
      factures,
      statistiques: stats[0] || {
        totalMontant: 0,
        totalPaye: 0,
        totalImpaye: 0,
        count: 0,
        payees: 0,
        enRetard: 0
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des factures:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des factures' });
  }
};

// Obtenir tous les abonnements (admin)
const getAllAbonnements = async (req, res) => {
  try {
    const { page = 1, limit = 10, statut } = req.query;
    const skip = (page - 1) * limit;

    // Construire la requête
    const query = {};
    if (statut) query.statut = statut;

    const abonnements = await Abonnement.find(query)
      .populate('proprietaireId', 'nom prenom email')
      .sort({ dateDebut: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Abonnement.countDocuments(query);

    res.json({
      abonnements,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des abonnements:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des abonnements' });
  }
};

// Supprimer un utilisateur (admin)
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Vérifier que l'utilisateur existe
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Ne pas permettre la suppression d'un admin si c'est le dernier
    if (user.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({ message: 'Impossible de supprimer le dernier administrateur' });
      }
    }

    // Suppression en cascade de toutes les données liées à l'utilisateur

    // 1. Si l'utilisateur est un propriétaire, gérer ses maisons et abonnements
    if (user.role === 'proprietaire') {
      // Récupérer toutes les maisons du propriétaire
      const maisons = await Maison.find({ proprietaireId: id });
      
      // Pour chaque maison, supprimer toutes les données associées
      for (const maison of maisons) {
        // Supprimer les consommations liées aux résidents de cette maison
        const residentsIds = maison.listeResidents || [];
        await Consommation.deleteMany({ 
          $or: [
            { maisonId: maison._id },
            { residentId: { $in: residentsIds } }
          ]
        });

        // Supprimer les factures liées aux résidents de cette maison
        await Facture.deleteMany({ 
          $or: [
            { maisonId: maison._id },
            { residentId: { $in: residentsIds } }
          ]
        });

        // Supprimer les résidents de cette maison
        await User.deleteMany({ _id: { $in: residentsIds } });

        // Supprimer la maison
        await Maison.findByIdAndDelete(maison._id);
      }

      // Supprimer les abonnements du propriétaire
      await Abonnement.deleteMany({ proprietaireId: id });
    }

    // 2. Si l'utilisateur est un résident
    if (user.role === 'resident') {
      // Retirer le résident de la liste des résidents dans les maisons
      await Maison.updateMany(
        { listeResidents: id },
        { $pull: { listeResidents: id } }
      );

      // Supprimer les consommations du résident
      await Consommation.deleteMany({ residentId: id });

      // Supprimer les factures du résident
      await Facture.deleteMany({ residentId: id });
    }

    // 3. Supprimer les résidents qui ont cet utilisateur comme propriétaire
    // (si l'utilisateur supprimé était un propriétaire mais pas géré ci-dessus)
    if (user.role === 'proprietaire') {
      const residents = await User.find({ idProprietaire: id, role: 'resident' });
      for (const resident of residents) {
        // Retirer de la liste des résidents dans les maisons
        if (resident.maisonId) {
          await Maison.updateOne(
            { _id: resident.maisonId },
            { $pull: { listeResidents: resident._id } }
          );
        }
        // Supprimer les consommations et factures du résident
        await Consommation.deleteMany({ residentId: resident._id });
        await Facture.deleteMany({ residentId: resident._id });
        // Supprimer le résident
        await User.findByIdAndDelete(resident._id);
      }
    }

    // 4. Supprimer les messages (expéditeur ou destinataire)
    await Message.deleteMany({
      $or: [
        { expediteur: id },
        { destinataire: id }
      ]
    });

    // 5. Supprimer les notifications (destinataire)
    await Notification.deleteMany({ destinataire: id });

    // 6. Supprimer les logs liés à l'utilisateur
    await Log.deleteMany({ user: id });

    // 7. Mettre à jour les références idProprietaire dans les autres utilisateurs
    await User.updateMany(
      { idProprietaire: id },
      { $set: { idProprietaire: null } }
    );

    // 8. Finalement, supprimer l'utilisateur lui-même
    await User.findByIdAndDelete(id);

    res.json({ message: 'Utilisateur et toutes ses données associées supprimés avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'utilisateur:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression de l\'utilisateur', error: error.message });
  }
};

// Supprimer une maison (admin)
const deleteMaison = async (req, res) => {
  try {
    const { id } = req.params;

    // Vérifier que la maison existe
    const maison = await Maison.findById(id);
    if (!maison) {
      return res.status(404).json({ message: 'Maison non trouvée' });
    }

    // Supprimer les consommations et factures liées
    await Consommation.deleteMany({ maisonId: id });
    await Facture.deleteMany({ maisonId: id });

    await Maison.findByIdAndDelete(id);

    res.json({ message: 'Maison supprimée avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de la maison:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression de la maison' });
  }
};

// Fonction pour obtenir tous les résidents avec pagination et filtres
const getResidents = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, statut } = req.query;
    const query = { role: 'resident' };

    if (search) {
      query.$or = [
        { nom: { $regex: search, $options: 'i' } },
        { prenom: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      select: '-motDePasse -refreshToken', // Exclure les champs sensibles
    };

    // Pagination manuelle en attendant le déploiement
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const residents = await User.find(query)
      .select('-motDePasse -refreshToken')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await User.countDocuments(query);

    // Enrichir avec les données des maisons et consommations
    const enrichedResidents = await Promise.all(
      residents.map(async (resident) => {
        // Trouver la maison du résident
        const maison = await Maison.findOne({ 
          listeResidents: resident._id 
        }).select('nomMaison adresse');

        // Calculer les statistiques
        const consommations = await Consommation.find({ 
          residentId: resident._id 
        });
        
        const totalKwh = consommations.reduce((sum, cons) => sum + (cons.kwh || 0), 0);
        const totalFactures = await Facture.countDocuments({ 
          residentId: resident._id 
        });

        return {
          ...resident.toObject(),
          maison: maison,
          statistiques: {
            totalKwh,
            totalFactures
          }
        };
      })
    );

    res.json({
      residents: enrichedResidents,
      pagination: {
        total: total,
        limit: parseInt(limit),
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des résidents:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des résidents' });
  }
};

// Fonction pour supprimer un résident
const deleteResident = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Vérifier que le résident existe
    const resident = await User.findById(id);
    if (!resident) {
      return res.status(404).json({ message: 'Résident non trouvé' });
    }

    // Retirer le résident de la maison associée
    if (resident.maisonId) {
      await Maison.updateOne(
        { _id: resident.maisonId },
        { $pull: { listeResidents: resident._id } }
      );
    }

    // Supprimer toutes les données associées au résident
    // Supprimer les consommations du résident
    await Consommation.deleteMany({ residentId: resident._id });

    // Supprimer les factures du résident
    await Facture.deleteMany({ residentId: resident._id });

    // Supprimer les messages (expéditeur ou destinataire)
    await Message.deleteMany({
      $or: [
        { expediteur: resident._id },
        { destinataire: resident._id }
      ]
    });

    // Supprimer les notifications (destinataire)
    await Notification.deleteMany({ destinataire: resident._id });

    // Supprimer les logs liés au résident
    await Log.deleteMany({ user: resident._id });

    // Supprimer le résident
    await User.findByIdAndDelete(resident._id);

    res.json({ message: 'Résident et toutes ses données associées supprimés avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression du résident:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression du résident' });
  }
};

// Messages
const getMessages = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, type, status } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
      query.$or = [
        { sujet: { $regex: search, $options: 'i' } },
        { contenu: { $regex: search, $options: 'i' } },
        { 'destinataire.nom': { $regex: search, $options: 'i' } },
        { 'destinataire.prenom': { $regex: search, $options: 'i' } }
      ];
    }
    if (type) query.type = type;
    if (status) query.statut = status;

    const messages = await Message.find(query)
      .populate('destinataire', 'nom prenom email')
      .populate('expediteur', 'nom prenom email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Message.countDocuments(query);

    res.json({
      messages,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des messages:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des messages' });
  }
};

// Notifications
const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, type, status } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
      query.$or = [
        { titre: { $regex: search, $options: 'i' } },
        { contenu: { $regex: search, $options: 'i' } },
        { 'destinataire.nom': { $regex: search, $options: 'i' } },
        { 'destinataire.prenom': { $regex: search, $options: 'i' } }
      ];
    }
    if (type) query.type = type;
    if (status) query.statut = status;

    const notifications = await Notification.find(query)
      .populate('destinataire', 'nom prenom email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Notification.countDocuments(query);

    res.json({
      notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des notifications:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des notifications' });
  }
};

// Logs
const getLogs = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, level, dateFrom, dateTo } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
      query.$or = [
        { message: { $regex: search, $options: 'i' } },
        { module: { $regex: search, $options: 'i' } },
        { action: { $regex: search, $options: 'i' } }
      ];
    }
    if (level) query.level = level;
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    const logs = await Log.find(query)
      .populate('user', 'nom prenom email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Log.countDocuments(query);

    res.json({
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des logs:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des logs' });
  }
};

// Tester l'envoi d'une notification FCM à un utilisateur
const testNotification = async (req, res) => {
  try {
    const { userId, message } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'userId requis' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    if (!user.deviceToken) {
      return res.status(400).json({ 
        message: 'L\'utilisateur n\'a pas de deviceToken enregistré',
        user: {
          id: user._id,
          nom: user.nom,
          prenom: user.prenom,
          email: user.email,
          role: user.role
        }
      });
    }

    const notifications = require('../utils/notifications');
    const testMessage = message || `Notification de test - ${new Date().toLocaleString('fr-FR')}`;
    
    const result = await notifications.envoyer(userId, testMessage);

    if (result.success) {
      res.json({
        message: 'Notification envoyée avec succès',
        user: {
          id: user._id,
          nom: user.nom,
          prenom: user.prenom,
          email: user.email,
          role: user.role,
          deviceToken: user.deviceToken.substring(0, 20) + '...' // Masquer le token complet
        },
        notification: {
          message: testMessage,
          sentAt: new Date(),
          response: result.response
        }
      });
    } else {
      res.status(500).json({
        message: 'Erreur lors de l\'envoi de la notification',
        error: result.error,
        user: {
          id: user._id,
          nom: user.nom,
          prenom: user.prenom,
          email: user.email,
          role: user.role
        }
      });
    }
  } catch (error) {
    console.error('Erreur lors du test de notification:', error);
    res.status(500).json({ message: 'Erreur lors du test de notification', error: error.message });
  }
};

module.exports = {
  getDashboardStats,
  getAllUsers,
  getAllMaisons,
  getAllConsommations,
  getAllFactures,
  getAllAbonnements,
  deleteUser,
  deleteMaison,
  getResidents,
  deleteResident,
  getMessages,
  getNotifications,
  getLogs,
  testNotification
};

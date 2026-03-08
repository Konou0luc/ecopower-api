const mongoose = require('mongoose');
const User = require('../models/User');
const Maison = require('../models/Maison');
const Consommation = require('../models/Consommation');
const Facture = require('../models/Facture');
const Abonnement = require('../models/Abonnement');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const Log = require('../models/Log');
const AppSettings = require('../models/AppSettings');

const getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalProprietaires = await User.countDocuments({ role: 'proprietaire' });
    const totalResidents = await User.countDocuments({ role: 'resident' });
    const totalAdmins = await User.countDocuments({ role: 'admin' });
    const totalMaisons = await Maison.countDocuments();
    
    const totalConsommations = await Consommation.countDocuments();
    const totalKwh = await Consommation.aggregate([
      { $group: { _id: null, total: { $sum: '$kwh' } } }
    ]);
    const totalMontantConsommations = await Consommation.aggregate([
      { $group: { _id: null, total: { $sum: '$montant' } } }
    ]);
    
    const totalFactures = await Facture.countDocuments();
    const facturesPayees = await Facture.countDocuments({ statut: 'payée' });
    const facturesEnRetard = await Facture.countDocuments({ statut: 'en retard' });
    const facturesEnAttente = await Facture.countDocuments({ statut: 'en attente' });
    
    const revenusTotaux = await Facture.aggregate([
      { $match: { statut: 'payée' } },
      { $group: { _id: null, total: { $sum: '$montant' } } }
    ]);
    
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


const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, role, search } = req.query;
    const skip = (page - 1) * limit;

    
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


const getUser = async (req, res) => {
  try {
    const { id } = req.params;

    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID utilisateur invalide' });
    }

    
    const user = await User.findById(id)
      .select('-motDePasse -refreshToken')
      .populate('maisonId', 'nomMaison adresse')
      .populate('abonnementId', 'typeAbonnement statut dateDebut dateFin')
      .populate('idProprietaire', 'nom prenom email telephone');

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    
    let stats = {};
    
    if (user.role === 'proprietaire') {
      
      const maisonsIds = await Maison.find({ proprietaireId: id }).distinct('_id');
      const [maisonsCount, facturesCount, consommationsCount] = await Promise.all([
        Maison.countDocuments({ proprietaireId: id }),
        Facture.countDocuments({ maisonId: { $in: maisonsIds } }),
        Consommation.countDocuments({ maisonId: { $in: maisonsIds } })
      ]);
      
      stats = {
        maisons: maisonsCount,
        factures: facturesCount,
        consommations: consommationsCount
      };
    } else if (user.role === 'resident') {
      
      const [consommationsCount, facturesCount] = await Promise.all([
        Consommation.countDocuments({ residentId: id }),
        Facture.countDocuments({ residentId: id })
      ]);
      
      stats = {
        consommations: consommationsCount,
        factures: facturesCount
      };
    }

    res.json({
      user: {
        ...user.toObject(),
        stats
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'utilisateur:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération de l\'utilisateur' });
  }
};


const getAllMaisons = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const skip = (page - 1) * limit;

    
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


const getAllConsommations = async (req, res) => {
  try {
    const { page = 1, limit = 10, annee, mois, maisonId } = req.query;
    const skip = (page - 1) * limit;

    
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


const getAllFactures = async (req, res) => {
  try {
    const { page = 1, limit = 10, statut, annee, maisonId } = req.query;
    const skip = (page - 1) * limit;

    
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


const getAllAbonnements = async (req, res) => {
  try {
    const { page = 1, limit = 10, statut } = req.query;
    const skip = (page - 1) * limit;

    
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


const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID utilisateur invalide' });
    }

    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    console.log(`🗑️ [DELETE USER] Début de la suppression de l'utilisateur ${id} (${user.role})`);

    
    if (user.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({ message: 'Impossible de supprimer le dernier administrateur' });
      }
    }

    

    
    if (user.role === 'proprietaire') {
      console.log(`🗑️ [DELETE USER] Suppression des maisons du propriétaire ${id}`);
      
      
      const maisons = await Maison.find({ proprietaireId: id });
      console.log(`🗑️ [DELETE USER] ${maisons.length} maison(s) trouvée(s) pour le propriétaire ${id}`);
      
      if (maisons.length > 0) {
        
        const tousResidentsIds = [];
        const toutesMaisonsIds = [];
        
        for (const maison of maisons) {
          toutesMaisonsIds.push(maison._id);
          if (maison.listeResidents && maison.listeResidents.length > 0) {
            tousResidentsIds.push(...maison.listeResidents.map(r => r.toString()));
          }
        }
        
        
        if (toutesMaisonsIds.length > 0 || tousResidentsIds.length > 0) {
          const consommationQuery = {
            $or: []
          };
          if (toutesMaisonsIds.length > 0) {
            consommationQuery.$or.push({ maisonId: { $in: toutesMaisonsIds } });
          }
          if (tousResidentsIds.length > 0) {
            consommationQuery.$or.push({ residentId: { $in: tousResidentsIds } });
          }
          if (consommationQuery.$or.length > 0) {
            const consommationsDeleted = await Consommation.deleteMany(consommationQuery);
            console.log(`🗑️ [DELETE USER] ${consommationsDeleted.deletedCount} consommation(s) supprimée(s)`);
          }
        }

        
        if (toutesMaisonsIds.length > 0 || tousResidentsIds.length > 0) {
          const factureQuery = {
            $or: []
          };
          if (toutesMaisonsIds.length > 0) {
            factureQuery.$or.push({ maisonId: { $in: toutesMaisonsIds } });
          }
          if (tousResidentsIds.length > 0) {
            factureQuery.$or.push({ residentId: { $in: tousResidentsIds } });
          }
          if (factureQuery.$or.length > 0) {
            const facturesDeleted = await Facture.deleteMany(factureQuery);
            console.log(`🗑️ [DELETE USER] ${facturesDeleted.deletedCount} facture(s) supprimée(s)`);
          }
        }

        
        if (tousResidentsIds.length > 0) {
          const residentsDeleted = await User.deleteMany({ _id: { $in: tousResidentsIds } });
          console.log(`🗑️ [DELETE USER] ${residentsDeleted.deletedCount} résident(s) supprimé(s)`);
        }

        
        const maisonsDeleted = await Maison.deleteMany({ proprietaireId: id });
        console.log(`🗑️ [DELETE USER] ${maisonsDeleted.deletedCount} maison(s) supprimée(s)`);
      }

      
      const abonnementsDeleted = await Abonnement.deleteMany({ proprietaireId: id });
      console.log(`🗑️ [DELETE USER] ${abonnementsDeleted.deletedCount} abonnement(s) supprimé(s)`);
    }

    
    if (user.role === 'resident') {
      
      await Maison.updateMany(
        { listeResidents: id },
        { $pull: { listeResidents: id } }
      );
      await Consommation.deleteMany({ residentId: id });
      await Facture.deleteMany({ residentId: id });
    }
    
    if (user.role === 'proprietaire') {
      const residents = await User.find({ idProprietaire: id, role: 'resident' });
      for (const resident of residents) {
        
        if (resident.maisonId) {
          await Maison.updateOne(
            { _id: resident.maisonId },
            { $pull: { listeResidents: resident._id } }
          );
        }
        
        await Consommation.deleteMany({ residentId: resident._id });
        await Facture.deleteMany({ residentId: resident._id });
        
        await User.findByIdAndDelete(resident._id);
      }
    }
    
    await Message.deleteMany({
      $or: [
        { expediteur: id },
        { destinataire: id }
      ]
    });
    
    await Notification.deleteMany({ destinataire: id });
    
    await Log.deleteMany({ user: id });
    
    await User.updateMany(
      { idProprietaire: id },
      { $set: { idProprietaire: null } }
    );
    
    await User.findByIdAndDelete(id);
    res.json({ message: 'Utilisateur et toutes ses données associées supprimés avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'utilisateur:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression de l\'utilisateur', error: error.message });
  }
};


const deleteMaison = async (req, res) => {
  try {
    const { id } = req.params;
    const maison = await Maison.findById(id);
    if (!maison) {
      return res.status(404).json({ message: 'Maison non trouvée' });
    }
    await Consommation.deleteMany({ maisonId: id });
    await Facture.deleteMany({ maisonId: id });
    await Maison.findByIdAndDelete(id);
    res.json({ message: 'Maison supprimée avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de la maison:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression de la maison' });
  }
};


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
      select: '-motDePasse -refreshToken', 
    };
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const residents = await User.find(query)
      .select('-motDePasse -refreshToken')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await User.countDocuments(query);
    
    const enrichedResidents = await Promise.all(
      residents.map(async (resident) => {
        
        const maison = await Maison.findOne({ 
          listeResidents: resident._id 
        }).select('nomMaison adresse');
        
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


const deleteResident = async (req, res) => {
  try {
    const { id } = req.params;
    
    const resident = await User.findById(id);
    if (!resident) {
      return res.status(404).json({ message: 'Résident non trouvé' });
    }
    
    if (resident.maisonId) {
      await Maison.updateOne(
        { _id: resident.maisonId },
        { $pull: { listeResidents: resident._id } }
      );
    }
    
    await Consommation.deleteMany({ residentId: resident._id });
    await Facture.deleteMany({ residentId: resident._id });
    await Message.deleteMany({
      $or: [
        { expediteur: resident._id },
        { destinataire: resident._id }
      ]
    });
    await Notification.deleteMany({ destinataire: resident._id });
    await Log.deleteMany({ user: resident._id });
    await User.findByIdAndDelete(resident._id);
    res.json({ message: 'Résident et toutes ses données associées supprimés avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression du résident:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression du résident' });
  }
};


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


const testNotification = async (req, res) => {
  try {
    const { userId, deviceToken, message } = req.body;

    
    if (!userId && !deviceToken) {
      return res.status(400).json({ 
        message: 'userId ou deviceToken requis',
        hint: 'Utilisez userId (ObjectId MongoDB) OU deviceToken (token FCM) - pas les deux en même temps',
        example1: { userId: '69419e5ee304dc2274b68f4d', message: 'Votre message' },
        example2: { deviceToken: 'df2kNHZAQ0G-6aBcewt2k-:APA91b...', message: 'Votre message' }
      });
    }

    
    if (userId && deviceToken) {
      return res.status(400).json({ 
        message: 'Utilisez soit userId, soit deviceToken, pas les deux',
        hint: 'Si vous avez un userId, utilisez uniquement userId. Si vous avez un deviceToken, utilisez uniquement deviceToken.'
      });
    }

    let user = null;
    let finalDeviceToken = null;

    
    if (deviceToken) {
      finalDeviceToken = deviceToken;
      
      user = await User.findOne({ deviceToken: deviceToken });
    } 
    
    else if (userId) {
      
      if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({ 
          message: 'userId invalide. Format attendu: ObjectId MongoDB (24 caractères hexadécimaux)',
          received: userId,
          hint: 'Si vous avez un deviceToken, utilisez le champ "deviceToken" au lieu de "userId"'
        });
      }

      user = await User.findById(userId);
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
      finalDeviceToken = user.deviceToken;
    }

    const notifications = require('../utils/notifications');
    const testMessage = message || `Notification de test - ${new Date().toLocaleString('fr-FR')}`;
    
    
    const admin = require('../config/firebase');
    const messagePayload = {
      notification: {
        title: 'Ecopower',
        body: testMessage
      },
      data: {
        type: 'test',
        timestamp: new Date().toISOString()
      },
      token: finalDeviceToken,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'ecopower_default'
        }
      },
      apns: {
        headers: {
          'apns-priority': '10'
        },
        payload: {
          aps: {
            sound: 'default',
            badge: 1
          }
        }
      }
    };

    console.log(`Envoi de notification de test`);
    console.log(`Device Token (preview): ${finalDeviceToken.substring(0, 20)}...`);
    
    const response = await admin.messaging().send(messagePayload);
    console.log('FCM envoyé avec succès. Message ID:', response);

    const result = {
      message: 'Notification envoyée avec succès',
      notification: {
        message: testMessage,
        sentAt: new Date(),
        messageId: response
      }
    };

    if (user) {
      result.user = {
        id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role,
        deviceToken: user.deviceToken ? user.deviceToken.substring(0, 20) + '...' : 'N/A'
      };
    } else {
      result.deviceToken = finalDeviceToken.substring(0, 20) + '...';
      result.note = 'Aucun utilisateur associé à ce deviceToken trouvé dans la base de données';
    }

    res.json(result);
  } catch (error) {
    console.error('Erreur lors du test de notification:', error);
    
    
    let errorMessage = error.message;
    if (error.code === 'messaging/invalid-registration-token' || 
        error.code === 'messaging/registration-token-not-registered') {
      errorMessage = 'Le deviceToken est invalide ou expiré. L\'utilisateur doit se reconnecter.';
    } else if (error.code === 'messaging/sender-id-mismatch') {
      errorMessage = 'Le deviceToken a été généré avec un projet Firebase différent. Vérifiez la configuration Firebase.';
    }
    
    res.status(500).json({ 
      message: 'Erreur lors du test de notification', 
      error: errorMessage,
      code: error.code || 'UNKNOWN_ERROR'
    });
  }
};


const broadcastNotification = async (req, res) => {
  try {
    const { message, title, role } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ 
        message: 'Le message est requis',
        hint: 'Le message ne peut pas être vide'
      });
    }

    const notificationTitle = title || 'Ecopower';
    const finalMessage = message.trim();

    
    const filter = {
      deviceToken: { $exists: true, $ne: null, $nin: ['', null] }
    };

    
    if (role && ['proprietaire', 'resident', 'admin'].includes(role)) {
      filter.role = role;
    }

    
    const users = await User.find(filter).select('_id nom prenom email role deviceToken');
    
    if (users.length === 0) {
      return res.status(404).json({ 
        message: 'Aucun utilisateur avec deviceToken trouvé',
        filter: role ? `Rôle: ${role}` : 'Tous les rôles'
      });
    }

    // Dédoubler par deviceToken pour éviter plusieurs envois au même appareil (ex: tests multicomptes)
    const uniqueUsersMap = new Map();
    for (const user of users) {
      if (!uniqueUsersMap.has(user.deviceToken)) {
        uniqueUsersMap.set(user.deviceToken, user);
      }
    }
    const uniqueUsers = Array.from(uniqueUsersMap.values());

    console.log(`[BROADCAST] Envoi de notification à ${uniqueUsers.length} appareil(s) unique(s) (parmi ${users.length} compte(s) ciblé(s))`);
    if (role) {
      console.log(`   Filtre: Rôle = ${role}`);
    }

    const admin = require('../config/firebase');
    
    const results = {
      total: uniqueUsers.length,
      success: 0,
      failed: 0,
      details: []
    };

    
    const batchSize = 10;
    for (let i = 0; i < uniqueUsers.length; i += batchSize) {
      const batch = uniqueUsers.slice(i, i + batchSize);
      
      await Promise.allSettled(
        batch.map(async (user) => {
          try {
            const messagePayload = {
              notification: {
                title: notificationTitle,
                body: finalMessage
              },
              data: {
                userId: user._id.toString(),
                type: 'broadcast',
                role: user.role
              },
              token: user.deviceToken,
              android: {
                priority: 'high',
                notification: {
                  sound: 'default',
                  channelId: 'ecopower_default'
                }
              },
              apns: {
                headers: {
                  'apns-priority': '10'
                },
                payload: {
                  aps: {
                    sound: 'default',
                    badge: 1
                  }
                }
              }
            };

            const response = await admin.messaging().send(messagePayload);
            results.success++;
            results.details.push({
              userId: user._id.toString(),
              email: user.email,
              role: user.role,
              status: 'success',
              messageId: response
            });
            console.log(`✅ Notification envoyée à ${user.email} (${user.role})`);
          } catch (error) {
            results.failed++;
            results.details.push({
              userId: user._id.toString(),
              email: user.email,
              role: user.role,
              status: 'failed',
              error: error.message,
              errorCode: error.code
            });
            console.error(`❌ Erreur pour ${user.email}:`, error.message);
          }
        })
      );

      
      if (i + batchSize < users.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`📊 [BROADCAST] Résultats: ${results.success} succès, ${results.failed} échecs sur ${results.total} total`);

    res.json({
      message: 'Diffusion de notification terminée',
      summary: {
        total: results.total,
        success: results.success,
        failed: results.failed,
        successRate: results.total > 0 ? ((results.success / results.total) * 100).toFixed(2) + '%' : '0%'
      },
      notification: {
        title: notificationTitle,
        message: finalMessage,
        sentAt: new Date(),
        filter: role || 'Tous les utilisateurs'
      },
      details: results.details
    });
  } catch (error) {
    console.error('Erreur lors de la diffusion de notification:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la diffusion de notification', 
      error: error.message 
    });
  }
};


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
    res.status(500).json({
      message: 'Erreur lors de la récupération des paramètres',
      error: error.message,
    });
  }
};

const updateAppInfo = async (req, res) => {
  try {
    const { email, phone, website, description, guideRapideUrl, privacyPolicyUrl } = req.body;
    const settings = await AppSettings.findOneAndUpdate(
      { key: 'contact' },
      {
        $set: {
          email: email ?? '',
          phone: phone ?? '',
          website: website ?? '',
          description: description ?? '',
          guideRapideUrl: guideRapideUrl ?? '',
          privacyPolicyUrl: privacyPolicyUrl ?? '',
        },
      },
      { new: true, upsert: true }
    );
    res.json({
      message: 'Paramètres de contact mis à jour',
      data: {
        email: settings.email,
        phone: settings.phone,
        website: settings.website,
        description: settings.description,
        guideRapideUrl: settings.guideRapideUrl,
        privacyPolicyUrl: settings.privacyPolicyUrl,
      },
    });
  } catch (error) {
    console.error('Erreur updateAppInfo:', error);
    res.status(500).json({
      message: 'Erreur lors de la mise à jour des paramètres',
      error: error.message,
    });
  }
};

module.exports = {
  getDashboardStats,
  getAllUsers,
  getUser,
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
  testNotification,
  broadcastNotification,
  getAppInfo,
  updateAppInfo,
};

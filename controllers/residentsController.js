const mongoose = require('mongoose');
const User = require('../models/User');
const Maison = require('../models/Maison');
const Consommation = require('../models/Consommation');
const Facture = require('../models/Facture');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const Log = require('../models/Log');
const notifications = require('../utils/notifications');


const getMyHouseResidents = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;

    console.log(`🔍 [RESIDENTS] getMyHouseResidents appelé pour userId: ${userId}, role: ${userRole}`);

    
    if (!userId) {
      console.log(`❌ [RESIDENTS] userId manquant`);
      return res.status(400).json({ message: 'Utilisateur non identifié' });
    }

    
    let maisonId;
    if (userRole === 'proprietaire') {
      
      const maison = await Maison.findOne({ proprietaireId: userId });
      if (!maison) {
        console.log(`❌ [RESIDENTS] Aucune maison trouvée pour le propriétaire ${userId}`);
        return res.json([]); 
      }
      maisonId = maison._id;
      console.log(`✅ [RESIDENTS] Maison trouvée pour le propriétaire: ${maisonId}`);
    } else if (userRole === 'resident') {
      
      const user = await User.findById(userId);
      if (!user || !user.maisonId) {
        console.log(`❌ [RESIDENTS] Aucune maison trouvée pour le résident ${userId}`);
        return res.json([]); 
      }
      maisonId = user.maisonId;
      console.log(`✅ [RESIDENTS] Maison trouvée pour le résident: ${maisonId}`);
    } else {
      console.log(`❌ [RESIDENTS] Rôle non autorisé: ${userRole}`);
      return res.status(403).json({ message: 'Rôle non autorisé' });
    }

    
    const residents = await User.find({
      maisonId: maisonId,
      role: 'resident',
      _id: { $ne: userId } 
    }).select('-motDePasse -firstLogin -createdAt -updatedAt -__v');

    console.log(`✅ [RESIDENTS] ${residents.length} résidents trouvés pour la maison ${maisonId}`);
    console.log(`📋 [RESIDENTS] Résidents:`, residents.map(r => ({ id: r._id, nom: r.nom, prenom: r.prenom, email: r.email })));

    res.json(residents);
  } catch (error) {
    console.error('❌ [RESIDENTS] Erreur lors de la récupération des résidents:', error);
    console.error('❌ [RESIDENTS] Stack trace:', error.stack);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};


const addResident = async (req, res) => {
  const { nom, prenom, email, telephone, maisonId } = req.body;
  
  try {

    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Cet email est déjà utilisé' });
    }

    
    const maison = await Maison.findOne({
      _id: maisonId,
      proprietaireId: req.user._id
    });

    if (!maison) {
      return res.status(404).json({ message: 'Maison non trouvée' });
    }

    if (
      typeof maison.nbResidentsMax === 'number' &&
      maison.nbResidentsMax > 0 &&
      maison.listeResidents.length >= maison.nbResidentsMax
    ) {
      return res.status(400).json({
        message: `Nombre maximal de résidents atteint pour cette maison (${maison.nbResidentsMax})`
      });
    }

    
    
    
    const resident = new User({
      nom,
      prenom,
      email,
      telephone,
      authMethod: 'google', 
      role: 'resident',
      idProprietaire: req.user._id,
      maisonId: maisonId,
      firstLogin: false 
    });

    await resident.save();

    
    await maison.ajouterResident(resident._id);

    
    let invitationSent = { success: false };
    try {
      const { sendGoogleInvitationEmail } = require('../utils/emailUtils');
      invitationSent = await sendGoogleInvitationEmail(
        email,
        `${prenom} ${nom}`,
        maison.nomMaison
      );
      
      
      if (!invitationSent.success || invitationSent.mode === 'simulation') {
        const { sendGoogleInvitationWhatsApp } = require('../utils/whatsappUtils');
        invitationSent = await sendGoogleInvitationWhatsApp(
          telephone,
          email,
          `${prenom} ${nom}`,
          maison.nomMaison
        );
      }
    } catch (e) {
      console.error('Erreur lors de l\'envoi de l\'invitation:', e);
      
      try {
        const { sendGoogleInvitationWhatsApp } = require('../utils/whatsappUtils');
        invitationSent = await sendGoogleInvitationWhatsApp(
          telephone,
          email,
          `${prenom} ${nom}`,
          maison.nomMaison
        );
      } catch (e2) {
        console.error('Erreur lors de l\'envoi WhatsApp fallback:', e2);
      }
    }

    
    try {
      await notifications.notifyNewResident(resident._id, req.user._id);
    } catch (e) {
      console.error('FCM new resident erreur:', e?.message || e);
    }

    res.status(201).json({
      message: 'Résident ajouté avec succès. Invitation Google Sign-In envoyée.',
      resident: {
        _id: resident._id,
        nom: resident.nom,
        prenom: resident.prenom,
        email: resident.email,
        telephone: resident.telephone,
        maisonId: resident.maisonId,
        authMethod: resident.authMethod
      },
      invitationSent
    });
  } catch (error) {
    console.error("❌ [RESIDENTS] Erreur lors de l'ajout du résident:", error);
    console.error("❌ [RESIDENTS] Stack trace:", error.stack);
    console.error("❌ [RESIDENTS] Détails:", {
      nom,
      prenom,
      email,
      telephone,
      maisonId,
      errorMessage: error.message,
      errorName: error.name
    });
    res.status(500).json({ 
      message: "Erreur lors de l'ajout du résident",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


const getResidents = async (req, res) => {
  try {
    const residents = await User.find({
      idProprietaire: req.user._id,
      role: 'resident'
    }).select('-motDePasse -refreshToken');

    
    const residentsWithHouse = await Promise.all(
      residents.map(async (resident) => {
        const maison = await Maison.findOne({ _id: resident.maisonId });
        return {
          ...resident.toObject(),
          maison: maison
            ? { _id: maison._id, nomMaison: maison.nomMaison }
            : null
        };
      })
    );

    res.json({
      residents: residentsWithHouse,
      count: residentsWithHouse.length
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des résidents:", error);
    res
      .status(500)
      .json({ message: "Erreur lors de la récupération des résidents" });
  }
};


const getResident = async (req, res) => {
  try {
    const { id } = req.params;

    const resident = await User.findOne({
      _id: id,
      idProprietaire: req.user._id,
      role: 'resident'
    }).select('-motDePasse -refreshToken');

    if (!resident) {
      return res.status(404).json({ message: "Résident non trouvé" });
    }

    const maison = resident.maisonId
      ? await Maison.findById(resident.maisonId)
      : null;

    res.json({
      resident: {
        ...resident.toObject(),
        maison: maison
          ? { _id: maison._id, nomMaison: maison.nomMaison }
          : null
      }
    });
  } catch (error) {
    console.error("Erreur lors de la récupération du résident:", error);
    res
      .status(500)
      .json({ message: "Erreur lors de la récupération du résident" });
  }
};


const deleteResident = async (req, res) => {
  try {
    const { id } = req.params;

    const resident = await User.findOne({
      _id: id,
      idProprietaire: req.user._id,
      role: 'resident'
    });

    if (!resident) {
      return res.status(404).json({ message: "Résident non trouvé" });
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

    res.json({ message: "Résident et toutes ses données associées supprimés avec succès" });
  } catch (error) {
    console.error("Erreur lors de la suppression du résident:", error);
    res.status(500).json({ message: "Erreur lors de la suppression du résident" });
  }
};


const updateResident = async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, prenom, email, telephone, maisonId } = req.body;

    const resident = await User.findOne({
      _id: id,
      idProprietaire: req.user._id,
      role: 'resident'
    });

    if (!resident) {
      return res.status(404).json({ message: "Résident non trouvé" });
    }

    if (email && email !== resident.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: "Cet email est déjà utilisé" });
      }
    }

    if (nom) resident.nom = nom;
    if (prenom) resident.prenom = prenom;
    if (email) resident.email = email;
    if (telephone) resident.telephone = telephone;
    if (maisonId) resident.maisonId = mongoose.Types.ObjectId(maisonId); 

    await resident.save();

    res.json({
      message: "Résident mis à jour avec succès",
      resident: {
        _id: resident._id,
        nom: resident.nom,
        prenom: resident.prenom,
        email: resident.email,
        telephone: resident.telephone,
        maisonId: resident.maisonId,
        firstLogin: resident.firstLogin
      }
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du résident:", error);
    res
      .status(500)
      .json({ message: "Erreur lors de la mise à jour du résident" });
  }
};


const resetResidentPassword = async (req, res) => {
  try {
    const { id } = req.params;

    
    const resident = await User.findOne({
      _id: id,
      idProprietaire: req.user._id,
      role: 'resident'
    });

    if (!resident) {
      return res.status(404).json({ message: "Résident non trouvé" });
    }

    
    const motDePasseTemporaire = generateTemporaryPassword();

    
    resident.motDePasse = motDePasseTemporaire;
    resident.firstLogin = true;
    await resident.save();

    
    try {
      const { sendPasswordResetEmail } = require('../utils/emailUtils');
      const emailResult = await sendPasswordResetEmail(
        resident.email,
        motDePasseTemporaire,
        `${resident.prenom} ${resident.nom}`
      );
      
      
      if (!emailResult.success || emailResult.mode === 'simulation') {
        await sendWhatsAppCredentials(
          resident.telephone,
          resident.email,
          motDePasseTemporaire
        );
      }
    } catch (e) {
      console.error('Erreur lors de l\'envoi du mot de passe:', e);
      
      try {
        await sendWhatsAppCredentials(
          resident.telephone,
          resident.email,
          motDePasseTemporaire
        );
      } catch (e2) {
        console.error('Erreur lors de l\'envoi WhatsApp fallback:', e2);
      }
    }

    res.json({
      message: "Mot de passe réinitialisé avec succès",
      temporaryPassword: motDePasseTemporaire
    });
  } catch (error) {
    console.error("Erreur lors de la réinitialisation du mot de passe:", error);
    res.status(500).json({ message: "Erreur lors de la réinitialisation du mot de passe" });
  }
};

module.exports = {
  addResident,
  getResidents,
  getResident,
  deleteResident,
  updateResident,
  getMyHouseResidents,
  resetResidentPassword
};

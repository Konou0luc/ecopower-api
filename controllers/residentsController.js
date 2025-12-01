const mongoose = require('mongoose');
const User = require('../models/User');
const Maison = require('../models/Maison');
const { generateTemporaryPassword } = require('../utils/passwordUtils');
const { sendWhatsAppCredentials } = require('../utils/whatsappUtils');
const notifications = require('../utils/notifications');

// Obtenir les résidents de la maison de l'utilisateur connecté
const getMyHouseResidents = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;

    console.log(`🔍 [RESIDENTS] getMyHouseResidents appelé pour userId: ${userId}, role: ${userRole}`);

    // Vérifier que l'utilisateur existe
    if (!userId) {
      console.log(`❌ [RESIDENTS] userId manquant`);
      return res.status(400).json({ message: 'Utilisateur non identifié' });
    }

    // Trouver la maison de l'utilisateur
    let maisonId;
    if (userRole === 'proprietaire') {
      // Pour les propriétaires, prendre la première maison
      const maison = await Maison.findOne({ proprietaireId: userId });
      if (!maison) {
        console.log(`❌ [RESIDENTS] Aucune maison trouvée pour le propriétaire ${userId}`);
        return res.json([]); // Retourner une liste vide au lieu d'une erreur
      }
      maisonId = maison._id;
      console.log(`✅ [RESIDENTS] Maison trouvée pour le propriétaire: ${maisonId}`);
    } else if (userRole === 'resident') {
      // Pour les résidents, prendre leur maisonId
      const user = await User.findById(userId);
      if (!user || !user.maisonId) {
        console.log(`❌ [RESIDENTS] Aucune maison trouvée pour le résident ${userId}`);
        return res.json([]); // Retourner une liste vide au lieu d'une erreur
      }
      maisonId = user.maisonId;
      console.log(`✅ [RESIDENTS] Maison trouvée pour le résident: ${maisonId}`);
    } else {
      console.log(`❌ [RESIDENTS] Rôle non autorisé: ${userRole}`);
      return res.status(403).json({ message: 'Rôle non autorisé' });
    }

    // Récupérer tous les résidents de cette maison spécifique (exclure le gérant)
    const residents = await User.find({
      maisonId: maisonId,
      role: 'resident',
      _id: { $ne: userId } // Exclure l'utilisateur connecté
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

// Ajouter un résident
const addResident = async (req, res) => {
  try {
    const { nom, prenom, email, telephone, maisonId } = req.body;

    // Vérifier si l'email existe déjà
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Cet email est déjà utilisé' });
    }

    // Vérifier que la maison appartient bien au propriétaire connecté
    const maison = await Maison.findOne({
      _id: maisonId,
      proprietaireId: req.user._id
    });

    if (!maison) {
      return res.status(404).json({ message: 'Maison non trouvée' });
    }

    // Générer un mot de passe temporaire
    const motDePasseTemporaire = generateTemporaryPassword();

    // Créer le résident et stocker maisonId
    const resident = new User({
      nom,
      prenom,
      email,
      telephone,
      motDePasse: motDePasseTemporaire,
      role: 'resident',
      idProprietaire: req.user._id,
      maisonId: maisonId,
      firstLogin: true
    });

    await resident.save();

    // Ajouter le résident dans la maison
    await maison.ajouterResident(resident._id);

    // Envoyer les identifiants par email (priorité) et WhatsApp (fallback)
    let credentialsSent = { success: false };
    try {
      const { sendCredentialsEmail } = require('../utils/emailUtils');
      credentialsSent = await sendCredentialsEmail(
        email,
        motDePasseTemporaire,
        `${prenom} ${nom}`
      );
      
      // Si l'email n'a pas pu être envoyé (mode simulation), essayer WhatsApp en fallback
      if (!credentialsSent.success || credentialsSent.mode === 'simulation') {
        credentialsSent = await sendWhatsAppCredentials(
          telephone,
          email,
          motDePasseTemporaire
        );
      }
    } catch (e) {
      console.error('Erreur lors de l\'envoi des identifiants:', e);
      // En cas d'erreur, essayer WhatsApp en fallback
      try {
        credentialsSent = await sendWhatsAppCredentials(
          telephone,
          email,
          motDePasseTemporaire
        );
      } catch (e2) {
        console.error('Erreur lors de l\'envoi WhatsApp fallback:', e2);
      }
    }

    // Notifier le propriétaire qu'un résident a été ajouté
    try {
      await notifications.notifyNewResident(resident._id, req.user._id);
    } catch (e) {
      console.error('FCM new resident erreur:', e?.message || e);
    }

    res.status(201).json({
      message: 'Résident ajouté avec succès',
      resident: {
        _id: resident._id,
        nom: resident.nom,
        prenom: resident.prenom,
        email: resident.email,
        telephone: resident.telephone,
        maisonId: resident.maisonId, // 🔥 inclure la maison dans la réponse
        firstLogin: resident.firstLogin
      },
      credentialsSent,
      temporaryPassword: motDePasseTemporaire // ⚠️ À retirer en production
    });
  } catch (error) {
    console.error("Erreur lors de l'ajout du résident:", error);
    res.status(500).json({ message: "Erreur lors de l'ajout du résident" });
  }
};

// Lister les résidents d'un propriétaire
const getResidents = async (req, res) => {
  try {
    const residents = await User.find({
      idProprietaire: req.user._id,
      role: 'resident'
    }).select('-motDePasse -refreshToken');

    // Ajouter le nom de la maison à chaque résident
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

// Obtenir un résident spécifique
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

// Supprimer un résident
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

    // Retirer le résident de la maison associée
    if (resident.maisonId) {
      await Maison.updateOne(
        { _id: resident.maisonId },
        { $pull: { listeResidents: resident._id } }
      );
    }

    await User.findByIdAndDelete(resident._id);

    res.json({ message: "Résident supprimé avec succès" });
  } catch (error) {
    console.error("Erreur lors de la suppression du résident:", error);
    res.status(500).json({ message: "Erreur lors de la suppression du résident" });
  }
};

// Mettre à jour un résident
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
    if (maisonId) resident.maisonId = mongoose.Types.ObjectId(maisonId); // 🔥 update maison

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

// Réinitialiser le mot de passe d'un résident (pour le gérant)
const resetResidentPassword = async (req, res) => {
  try {
    const { id } = req.params;

    // Vérifier que le résident appartient bien au propriétaire
    const resident = await User.findOne({
      _id: id,
      idProprietaire: req.user._id,
      role: 'resident'
    });

    if (!resident) {
      return res.status(404).json({ message: "Résident non trouvé" });
    }

    // Générer un nouveau mot de passe temporaire
    const motDePasseTemporaire = generateTemporaryPassword();

    // Mettre à jour le mot de passe et réinitialiser firstLogin
    resident.motDePasse = motDePasseTemporaire;
    resident.firstLogin = true;
    await resident.save();

    // Envoyer le nouveau mot de passe par email
    try {
      const { sendPasswordResetEmail } = require('../utils/emailUtils');
      const emailResult = await sendPasswordResetEmail(
        resident.email,
        motDePasseTemporaire,
        `${resident.prenom} ${resident.nom}`
      );
      
      // Si l'email n'a pas pu être envoyé (mode simulation), essayer WhatsApp en fallback
      if (!emailResult.success || emailResult.mode === 'simulation') {
        await sendWhatsAppCredentials(
          resident.telephone,
          resident.email,
          motDePasseTemporaire
        );
      }
    } catch (e) {
      console.error('Erreur lors de l\'envoi du mot de passe:', e);
      // En cas d'erreur, essayer WhatsApp en fallback
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

const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Abonnement = require('../models/Abonnement');
const { generateTemporaryPassword } = require('../utils/passwordUtils');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );

  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN }
  );

  return { accessToken, refreshToken };
};

const register = async (req, res) => {
  try {
    const { nom, prenom, email, telephone, motDePasse, role } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Cet email est déjà utilisé' });
    }

    const isAdminRequest = role === 'admin';

    if (isAdminRequest) {
      const existingAdmin = await User.findOne({ role: 'admin' });
      if (existingAdmin) {
        return res.status(400).json({ message: 'Un administrateur existe déjà' });
      }
    }

    const user = new User({
      nom,
      prenom,
      email,
      telephone,
      motDePasse,
      role: isAdminRequest ? 'admin' : 'proprietaire'
    });

    await user.save();

    const { accessToken, refreshToken } = generateTokens(user._id);

    user.refreshToken = refreshToken;
    await user.save();

    const message = isAdminRequest ? 'Compte administrateur créé avec succès' : 'Compte propriétaire créé avec succès';
    
    res.status(201).json({
      message,
      user,
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement:', error);
    res.status(500).json({ message: 'Erreur lors de la création du compte' });
  }
};

const FREE_MODE = process.env.FREE_MODE === 'true';

const login = async (req, res) => {
  try {
    console.log('🔐 [LOGIN] Tentative de connexion reçue');
    console.log('🔐 [LOGIN] Body:', JSON.stringify(req.body));
    console.log('🔐 [LOGIN] Headers:', JSON.stringify(req.headers));
    
    const { email, motDePasse } = req.body;

    if (!email || !motDePasse) {
      console.log('❌ [LOGIN] Email ou mot de passe manquant');
      return res.status(400).json({ message: 'Email et mot de passe requis' });
    }

    const normalizedEmail = (email || '').toString().trim().toLowerCase();
    const normalizedPassword = (motDePasse || '').toString().trim();

    console.log('🔐 [LOGIN] Email normalisé:', normalizedEmail);
    console.log('🔐 [LOGIN] Recherche de l\'utilisateur...');

    let user = await User.findOne({ email: normalizedEmail });
    if (!user && email) {
      user = await User.findOne({ telephone: (email || '').toString().trim() });
    }
    
    if (!user) {
      console.log('❌ [LOGIN] Utilisateur non trouvé pour:', normalizedEmail);
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }

    console.log('✅ [LOGIN] Utilisateur trouvé:', user.email, 'Role:', user.role);

    if (user.authMethod === 'google' || !user.motDePasse) {
      console.log('❌ [LOGIN] Cet utilisateur utilise Google Sign-In');
      return res.status(400).json({ 
        message: 'Cet compte utilise Google Sign-In. Veuillez vous connecter avec Google.',
        useGoogleSignIn: true
      });
    }

    const isPasswordValid = await user.comparePassword(normalizedPassword);
    if (!isPasswordValid) {
      console.log('❌ [LOGIN] Mot de passe incorrect pour:', normalizedEmail);
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }

    console.log('✅ [LOGIN] Mot de passe valide');

    const { accessToken, refreshToken } = generateTokens(user._id);

    user.refreshToken = refreshToken;
    await user.save();

    let abonnement = null;
    if (FREE_MODE) {
      const now = new Date();
      const future = new Date(now);
      future.setFullYear(future.getFullYear() + 5);
      abonnement = {
        statut: 'actif',
        isActive: true,
        dateDebut: now,
        dateFin: future,
        nbResidentsMax: 9999,
      };
    } else if (user.role === 'proprietaire' && user.abonnementId) {
      abonnement = await Abonnement.findById(user.abonnementId);
      if (abonnement) {
        abonnement.isActif();
        await abonnement.save();
      }
    }

    console.log('✅ [LOGIN] Connexion réussie pour:', user.email, 'Role:', user.role);
    
    res.json({
      message: 'Connexion réussie',
      user,
      accessToken,
      refreshToken,
      abonnement
    });
  } catch (error) {
    console.error('💥 [LOGIN] Erreur lors de la connexion:', error);
    console.error('💥 [LOGIN] Stack:', error.stack);
    res.status(500).json({ 
      message: 'Erreur lors de la connexion',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token requis' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ message: 'Refresh token invalide' });
    }

    const tokens = generateTokens(user._id);

    user.refreshToken = tokens.refreshToken;
    await user.save();

    res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    });
  } catch (error) {
    console.error('Erreur lors du refresh token:', error);
    res.status(401).json({ message: 'Refresh token invalide' });
  }
};

const logout = async (req, res) => {
  try {
    req.user.refreshToken = null;
    await req.user.save();

    res.json({ message: 'Déconnexion réussie' });
  } catch (error) {
    console.error('Erreur lors de la déconnexion:', error);
    res.status(500).json({ message: 'Erreur lors de la déconnexion' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { nouveauMotDePasse } = req.body;

    if (!req.user.firstLogin) {
      return res.status(400).json({ message: 'Cette opération n\'est pas nécessaire' });
    }

    req.user.motDePasse = nouveauMotDePasse;
    req.user.firstLogin = false;
    await req.user.save();

    res.json({ 
      message: 'Mot de passe mis à jour avec succès',
      user: req.user
    });
  } catch (error) {
    console.error('Erreur lors du changement de mot de passe:', error);
    res.status(500).json({ message: 'Erreur lors du changement de mot de passe' });
  }
};

const changePassword = async (req, res) => {
  try {
    const { motDePasseActuel, nouveauMotDePasse } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    const isPasswordValid = await user.comparePassword(motDePasseActuel);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Mot de passe actuel incorrect' });
    }

    user.motDePasse = nouveauMotDePasse;
    await user.save();

    res.json({ message: 'Mot de passe mis à jour avec succès' });
  } catch (error) {
    console.error('Erreur lors du changement de mot de passe:', error);
    res.status(500).json({ message: 'Erreur lors du changement de mot de passe' });
  }
};

const getCurrentUser = async (req, res) => {
  try {
    console.log('🔍 [API] Récupération des données utilisateur:', req.user._id);

    const user = await User.findById(req.user._id).select('-motDePasse -refreshToken');

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    let abonnement = null;
    if (FREE_MODE) {
      const now = new Date();
      const future = new Date(now);
      future.setFullYear(future.getFullYear() + 5);
      abonnement = {
        statut: 'actif',
        isActive: true,
        dateDebut: now,
        dateFin: future,
        nbResidentsMax: 9999,
      };
    } else if (user.role === 'proprietaire' && user.abonnementId) {
      abonnement = await Abonnement.findById(user.abonnementId);
      if (abonnement) {
        abonnement.isActif();
        await abonnement.save();
      }
    }

    let maisons = [];
    const Maison = require('../models/Maison');
    if (user.role === 'proprietaire') {
      maisons = await Maison.find({ proprietaireId: user._id });
    } else if (user.role === 'resident') {
      const maison = await Maison.findOne({ listeResidents: user._id });
      if (maison) {
        maisons = [maison];
      }
    }

    let residents = [];
    if (user.role === 'proprietaire') {
      residents = await User.find({ idProprietaire: user._id, role: 'resident' }).select('-motDePasse -refreshToken');
    }

    console.log('✅ [API] Données utilisateur récupérées avec succès');
    
    res.json({
      user,
      abonnement,
      maisons,
      residents,
      message: 'Données utilisateur récupérées avec succès'
    });
  } catch (error) {
    console.error('💥 [API] Erreur lors de la récupération des données utilisateur:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des données utilisateur' });
  }
};

const setHomeLocation = async (req, res) => {
  try {
    const { latitude, longitude, city, country } = req.body;

    if (latitude == null || longitude == null || typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({ message: 'Latitude et longitude requises (nombres)' });
    }

    req.user.homeLatitude = latitude;
    req.user.homeLongitude = longitude;
    req.user.homeCity = city || null;
    req.user.homeCountry = country || null;
    req.user.homeLocationSource = 'gps';
    await req.user.save();

    return res.json({
      message: 'Localisation du domicile enregistrée',
      homeLatitude: req.user.homeLatitude,
      homeLongitude: req.user.homeLongitude,
      homeCity: req.user.homeCity,
      homeCountry: req.user.homeCountry,
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la localisation:', error);
    res.status(500).json({ message: 'Erreur lors de l\'enregistrement de la localisation' });
  }
};

const setDeviceToken = async (req, res) => {
  try {
    const { deviceToken } = req.body;

    if (!deviceToken || typeof deviceToken !== 'string') {
      return res.status(400).json({ message: 'deviceToken requis' });
    }

    req.user.deviceToken = deviceToken;
    await req.user.save();

    return res.json({
      message: 'Device token mis à jour avec succès',
      deviceToken: req.user.deviceToken,
    });
  } catch (error) {
    console.error('💥 [API] Erreur lors de la mise à jour du deviceToken:', error);
    return res.status(500).json({ message: 'Erreur lors de la mise à jour du device token' });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email, telephone } = req.body;

    if (!email && !telephone) {
      return res.status(400).json({ message: 'Email ou téléphone requis' });
    }

    let user;
    if (email) {
      user = await User.findOne({ email: email.trim().toLowerCase() });
    } else {
      user = await User.findOne({ telephone: telephone.trim() });
    }

    if (!user) {
      return res.json({
        message: 'Si un compte existe avec cet email/téléphone, un nouveau mot de passe temporaire a été généré.'
      });
    }

    const motDePasseTemporaire = generateTemporaryPassword();

    user.motDePasse = motDePasseTemporaire;
    user.firstLogin = true;
    await user.save();

    try {
      const { sendPasswordResetEmail } = require('../utils/emailUtils');
      const emailResult = await sendPasswordResetEmail(
        user.email,
        motDePasseTemporaire,
        `${user.prenom} ${user.nom}`
      );

      if (!emailResult.success || emailResult.mode === 'simulation') {
        const { sendWhatsAppCredentials } = require('../utils/whatsappUtils');
        await sendWhatsAppCredentials(
          user.telephone,
          user.email,
          motDePasseTemporaire
        );
      }
    } catch (e) {
      console.error('Erreur lors de l\'envoi du mot de passe:', e);
      try {
        const { sendWhatsAppCredentials } = require('../utils/whatsappUtils');
        await sendWhatsAppCredentials(
          user.telephone,
          user.email,
          motDePasseTemporaire
        );
      } catch (e2) {
        console.error('Erreur lors de l\'envoi WhatsApp fallback:', e2);
      }
    }

    res.json({
      message: 'Un nouveau mot de passe temporaire a été généré et envoyé',
      ...(process.env.NODE_ENV === 'development' && { temporaryPassword: motDePasseTemporaire })
    });
  } catch (error) {
    console.error('Erreur lors de la réinitialisation du mot de passe:', error);
    res.status(500).json({ message: 'Erreur lors de la réinitialisation du mot de passe' });
  }
};

const googleAuth = async (req, res) => {
  try {
    const { idToken, telephone, nom, prenom } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: 'Token Google requis' });
    }

    console.log('🔐 [GOOGLE AUTH] Tentative d\'authentification Google');

    let ticket;
    try {
      ticket = await googleClient.verifyIdToken({
        idToken: idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
    } catch (error) {
      console.error('❌ [GOOGLE AUTH] Erreur de vérification du token:', error);
      return res.status(401).json({ message: 'Token Google invalide' });
    }

    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email?.toLowerCase().trim();
    const googleName = payload.name || '';
    const googleGivenName = payload.given_name || '';
    const googleFamilyName = payload.family_name || '';

    if (!email) {
      return res.status(400).json({ message: 'Email non disponible dans le compte Google' });
    }

    console.log('✅ [GOOGLE AUTH] Token vérifié pour:', email);

    let user = await User.findOne({
      $or: [
        { googleId: googleId },
        { email: email }
      ]
    });

    if (user) {
      if (!user.googleId) {
        user.googleId = googleId;
        user.authMethod = 'google';
        await user.save();
      }

      if (user.googleId !== googleId) {
        return res.status(400).json({ 
          message: 'Cet email est associé à un autre compte Google' 
        });
      }

      const { accessToken, refreshToken } = generateTokens(user._id);
      user.refreshToken = refreshToken;
      await user.save();

      let abonnement = null;
      if (FREE_MODE) {
        const now = new Date();
        const future = new Date(now);
        future.setFullYear(future.getFullYear() + 5);
        abonnement = {
          statut: 'actif',
          isActive: true,
          dateDebut: now,
          dateFin: future,
          nbResidentsMax: 9999,
        };
      } else if (user.role === 'proprietaire' && user.abonnementId) {
        abonnement = await Abonnement.findById(user.abonnementId);
        if (abonnement) {
          abonnement.isActif();
          await abonnement.save();
        }
      }

      console.log('✅ [GOOGLE AUTH] Connexion réussie pour:', user.email, 'Role:', user.role);

      return res.json({
        message: 'Connexion réussie',
        user,
        accessToken,
        refreshToken,
        abonnement,
        needsRegistration: false
      });
    }

    const existingResident = await User.findOne({ 
      email: email, 
      role: 'resident' 
    });

    if (existingResident) {
      if (!existingResident.googleId) {
        existingResident.googleId = googleId;
        existingResident.authMethod = 'google';
        await existingResident.save();
      }

      if (existingResident.googleId !== googleId) {
        return res.status(400).json({ 
          message: 'Cet email est associé à un autre compte Google' 
        });
      }

      const { accessToken, refreshToken } = generateTokens(existingResident._id);
      existingResident.refreshToken = refreshToken;
      await existingResident.save();

      console.log('✅ [GOOGLE AUTH] Connexion résident réussie pour:', existingResident.email);

      return res.json({
        message: 'Connexion réussie',
        user: existingResident,
        accessToken,
        refreshToken,
        abonnement: null,
        needsRegistration: false
      });
    }

    if (!telephone) {
      const finalNom = nom || googleFamilyName || googleName.split(' ').slice(-1).join(' ') || '';
      const finalPrenom = prenom || googleGivenName || googleName.split(' ').slice(0, -1).join(' ') || googleName || '';

      return res.status(200).json({
        message: 'Informations supplémentaires requises',
        needsRegistration: true,
        googleData: {
          email: email,
          nom: finalNom,
          prenom: finalPrenom,
          googleId: googleId
        },
        requiredFields: ['telephone']
      });
    }

    const finalNom = nom || googleFamilyName || googleName.split(' ').slice(-1).join(' ') || '';
    const finalPrenom = prenom || googleGivenName || googleName.split(' ').slice(0, -1).join(' ') || googleName || '';

    if (!finalNom || !finalPrenom) {
      return res.status(400).json({ 
        message: 'Nom et prénom requis',
        needsRegistration: true,
        googleData: {
          email: email,
          nom: finalNom,
          prenom: finalPrenom,
          googleId: googleId
        },
        requiredFields: ['nom', 'prenom', 'telephone']
      });
    }

    const emailExists = await User.findOne({ email: email });
    if (emailExists) {
      return res.status(400).json({ message: 'Cet email est déjà utilisé' });
    }

    user = new User({
      nom: finalNom,
      prenom: finalPrenom,
      email: email,
      telephone: telephone.trim(),
      googleId: googleId,
      authMethod: 'google',
      role: 'proprietaire',
      motDePasse: null
    });

    await user.save();

    const { accessToken, refreshToken } = generateTokens(user._id);
    user.refreshToken = refreshToken;
    await user.save();

    console.log('✅ [GOOGLE AUTH] Nouveau compte créé pour:', user.email);

    res.status(201).json({
      message: 'Compte créé avec succès',
      user,
      accessToken,
      refreshToken,
      abonnement: null,
      needsRegistration: false
    });
  } catch (error) {
    console.error('💥 [GOOGLE AUTH] Erreur lors de l\'authentification Google:', error);
    res.status(500).json({ 
      message: 'Erreur lors de l\'authentification Google',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const deleteMyAccount = async (req, res) => {
  try {
    const { motDePasse } = req.body;
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    if (user.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({ message: 'Impossible de supprimer le dernier administrateur' });
      }
    }

    if (user.authMethod === 'email' && user.motDePasse) {
      if (!motDePasse) {
        return res.status(400).json({ message: 'Mot de passe requis pour supprimer votre compte' });
      }
      const isPasswordValid = await user.comparePassword(motDePasse);
      if (!isPasswordValid) {
        return res.status(400).json({ message: 'Mot de passe incorrect' });
      }
    }

    console.log(`🗑️ [DELETE MY ACCOUNT] Début de la suppression du compte ${userId} (${user.role})`);

    const Maison = require('../models/Maison');
    const Consommation = require('../models/Consommation');
    const Facture = require('../models/Facture');
    const Message = require('../models/Message');
    const Notification = require('../models/Notification');
    const Log = require('../models/Log');
    const Abonnement = require('../models/Abonnement');

    if (user.role === 'proprietaire') {
      const maisons = await Maison.find({ proprietaireId: userId });
      
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
          const consommationQuery = { $or: [] };
          if (toutesMaisonsIds.length > 0) {
            consommationQuery.$or.push({ maisonId: { $in: toutesMaisonsIds } });
          }
          if (tousResidentsIds.length > 0) {
            consommationQuery.$or.push({ residentId: { $in: tousResidentsIds } });
          }
          if (consommationQuery.$or.length > 0) {
            await Consommation.deleteMany(consommationQuery);
          }
        }

        if (toutesMaisonsIds.length > 0 || tousResidentsIds.length > 0) {
          const factureQuery = { $or: [] };
          if (toutesMaisonsIds.length > 0) {
            factureQuery.$or.push({ maisonId: { $in: toutesMaisonsIds } });
          }
          if (tousResidentsIds.length > 0) {
            factureQuery.$or.push({ residentId: { $in: tousResidentsIds } });
          }
          if (factureQuery.$or.length > 0) {
            await Facture.deleteMany(factureQuery);
          }
        }

        if (tousResidentsIds.length > 0) {
          await User.deleteMany({ _id: { $in: tousResidentsIds } });
        }

        await Maison.deleteMany({ proprietaireId: userId });
      }

      await Abonnement.deleteMany({ proprietaireId: userId });
    }

    if (user.role === 'resident') {
      await Maison.updateMany(
        { listeResidents: userId },
        { $pull: { listeResidents: userId } }
      );
      await Consommation.deleteMany({ residentId: userId });
      await Facture.deleteMany({ residentId: userId });
    }

    await Message.deleteMany({
      $or: [
        { expediteur: userId },
        { destinataire: userId }
      ]
    });

    await Notification.deleteMany({ destinataire: userId });

    await Log.deleteMany({ user: userId });

    await User.updateMany(
      { idProprietaire: userId },
      { $set: { idProprietaire: null } }
    );

    await User.findByIdAndDelete(userId);

    console.log(`✅ [DELETE MY ACCOUNT] Compte ${userId} supprimé avec succès`);

    res.json({ message: 'Votre compte et toutes vos données ont été supprimés avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression du compte:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression du compte', error: error.message });
  }
};

module.exports = {
  register,
  login,
  googleAuth,
  refreshToken,
  logout,
  resetPassword,
  changePassword,
  getCurrentUser,
  setDeviceToken,
  setHomeLocation,
  forgotPassword,
  deleteMyAccount
};

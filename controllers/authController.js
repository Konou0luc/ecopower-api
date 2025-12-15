const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Abonnement = require('../models/Abonnement');
const { generateTemporaryPassword } = require('../utils/passwordUtils');

// Initialiser le client Google OAuth2
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Générer les tokens JWT
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

// Enregistrement d'un propriétaire
const register = async (req, res) => {
  try {
    const { nom, prenom, email, telephone, motDePasse, role } = req.body;

    // Vérifier si l'email existe déjà
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Cet email est déjà utilisé' });
    }

    // Vérifier si c'est une demande de création d'admin
    const isAdminRequest = role === 'admin';
    
    // Si c'est une demande d'admin, vérifier s'il n'y a pas déjà un admin
    if (isAdminRequest) {
      const existingAdmin = await User.findOne({ role: 'admin' });
      if (existingAdmin) {
        return res.status(400).json({ message: 'Un administrateur existe déjà' });
      }
    }

    // Créer l'utilisateur
    const user = new User({
      nom,
      prenom,
      email,
      telephone,
      motDePasse,
      role: isAdminRequest ? 'admin' : 'proprietaire'
    });

    await user.save();

    // Générer les tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Sauvegarder le refresh token
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

// Connexion
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

    // Normaliser les identifiants (évite les erreurs de casse/espaces)
    const normalizedEmail = (email || '').toString().trim().toLowerCase();
    const normalizedPassword = (motDePasse || '').toString().trim();

    console.log('🔐 [LOGIN] Email normalisé:', normalizedEmail);
    console.log('🔐 [LOGIN] Recherche de l\'utilisateur...');

    // Vérifier si l'utilisateur existe (par email normalisé ou téléphone saisi à la place de l'email)
    let user = await User.findOne({ email: normalizedEmail });
    if (!user && email) {
      // Si l'utilisateur a saisi son téléphone à la place de l'email
      user = await User.findOne({ telephone: (email || '').toString().trim() });
    }
    
    if (!user) {
      console.log('❌ [LOGIN] Utilisateur non trouvé pour:', normalizedEmail);
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }

    console.log('✅ [LOGIN] Utilisateur trouvé:', user.email, 'Role:', user.role);

    // Vérifier si l'utilisateur utilise Google Sign-In
    if (user.authMethod === 'google' || !user.motDePasse) {
      console.log('❌ [LOGIN] Cet utilisateur utilise Google Sign-In');
      return res.status(400).json({ 
        message: 'Cet compte utilise Google Sign-In. Veuillez vous connecter avec Google.',
        useGoogleSignIn: true
      });
    }

    // Vérifier le mot de passe
    const isPasswordValid = await user.comparePassword(normalizedPassword);
    if (!isPasswordValid) {
      console.log('❌ [LOGIN] Mot de passe incorrect pour:', normalizedEmail);
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }

    console.log('✅ [LOGIN] Mot de passe valide');

    // Générer les tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Sauvegarder le refresh token
    user.refreshToken = refreshToken;
    await user.save();

    // Récupérer l'abonnement si c'est un propriétaire
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

// Refresh token
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

    // Générer de nouveaux tokens
    const tokens = generateTokens(user._id);

    // Sauvegarder le nouveau refresh token
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

// Déconnexion
const logout = async (req, res) => {
  try {
    // Supprimer le refresh token
    req.user.refreshToken = null;
    await req.user.save();

    res.json({ message: 'Déconnexion réussie' });
  } catch (error) {
    console.error('Erreur lors de la déconnexion:', error);
    res.status(500).json({ message: 'Erreur lors de la déconnexion' });
  }
};

// Changement de mot de passe (pour premier login)
const resetPassword = async (req, res) => {
  try {
    const { nouveauMotDePasse } = req.body;

    if (!req.user.firstLogin) {
      return res.status(400).json({ message: 'Cette opération n\'est pas nécessaire' });
    }

    // Mettre à jour le mot de passe
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

// Changement de mot de passe normal
const changePassword = async (req, res) => {
  try {
    const { motDePasseActuel, nouveauMotDePasse } = req.body;

    // Recharger l'utilisateur avec le mot de passe (le middleware exclut ce champ)
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Vérifier l'ancien mot de passe
    const isPasswordValid = await user.comparePassword(motDePasseActuel);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Mot de passe actuel incorrect' });
    }

    // Mettre à jour le mot de passe
    user.motDePasse = nouveauMotDePasse;
    await user.save();

    res.json({ message: 'Mot de passe mis à jour avec succès' });
  } catch (error) {
    console.error('Erreur lors du changement de mot de passe:', error);
    res.status(500).json({ message: 'Erreur lors du changement de mot de passe' });
  }
};

// Récupérer les informations de l'utilisateur connecté
const getCurrentUser = async (req, res) => {
  try {
    console.log('🔍 [API] Récupération des données utilisateur:', req.user._id);
    
    // Récupérer l'utilisateur avec ses données complètes
    const user = await User.findById(req.user._id).select('-motDePasse -refreshToken');
    
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Récupérer l'abonnement si c'est un propriétaire
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

    // Récupérer les maisons
    let maisons = [];
    const Maison = require('../models/Maison');
    if (user.role === 'proprietaire') {
      maisons = await Maison.find({ proprietaireId: user._id });
    } else if (user.role === 'resident') {
      // Pour les résidents, récupérer leur maison via la liste des résidents
      const maison = await Maison.findOne({ listeResidents: user._id });
      if (maison) {
        maisons = [maison];
      }
    }

    // Récupérer les résidents si c'est un propriétaire
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

// Enregistrer/mettre à jour le device token FCM de l'utilisateur connecté
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

// Mot de passe oublié (pour tous les utilisateurs, sans authentification)
const forgotPassword = async (req, res) => {
  try {
    const { email, telephone } = req.body;

    // Vérifier qu'au moins un identifiant est fourni
    if (!email && !telephone) {
      return res.status(400).json({ message: 'Email ou téléphone requis' });
    }

    // Rechercher l'utilisateur par email ou téléphone
    let user;
    if (email) {
      user = await User.findOne({ email: email.trim().toLowerCase() });
    } else {
      user = await User.findOne({ telephone: telephone.trim() });
    }

    // Ne pas révéler si l'utilisateur existe ou non pour des raisons de sécurité
    if (!user) {
      // Retourner un message de succès même si l'utilisateur n'existe pas
      return res.json({
        message: 'Si un compte existe avec cet email/téléphone, un nouveau mot de passe temporaire a été généré.'
      });
    }

    // Générer un nouveau mot de passe temporaire
    const motDePasseTemporaire = generateTemporaryPassword();

    // Mettre à jour le mot de passe et réinitialiser firstLogin
    user.motDePasse = motDePasseTemporaire;
    user.firstLogin = true;
    await user.save();

    // Envoyer le nouveau mot de passe par email
    try {
      const { sendPasswordResetEmail } = require('../utils/emailUtils');
      const emailResult = await sendPasswordResetEmail(
        user.email,
        motDePasseTemporaire,
        `${user.prenom} ${user.nom}`
      );
      
      // Si l'email n'a pas pu être envoyé (mode simulation), essayer WhatsApp en fallback
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
      // En cas d'erreur, essayer WhatsApp en fallback
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

    // En production, ne pas retourner le mot de passe dans la réponse
    // Pour le développement, on le retourne pour faciliter les tests
    res.json({
      message: 'Un nouveau mot de passe temporaire a été généré et envoyé',
      // En production, commenter la ligne suivante :
      ...(process.env.NODE_ENV === 'development' && { temporaryPassword: motDePasseTemporaire })
    });
  } catch (error) {
    console.error('Erreur lors de la réinitialisation du mot de passe:', error);
    res.status(500).json({ message: 'Erreur lors de la réinitialisation du mot de passe' });
  }
};

// Authentification Google Sign-In
const googleAuth = async (req, res) => {
  try {
    const { idToken, telephone, nom, prenom } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: 'Token Google requis' });
    }

    console.log('🔐 [GOOGLE AUTH] Tentative d\'authentification Google');

    // Vérifier le token Google
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

    // Chercher l'utilisateur par googleId ou email
    let user = await User.findOne({
      $or: [
        { googleId: googleId },
        { email: email }
      ]
    });

    // Si l'utilisateur existe
    if (user) {
      // Si l'utilisateur n'a pas encore de googleId, le lier
      if (!user.googleId) {
        user.googleId = googleId;
        user.authMethod = 'google';
        // Si l'utilisateur avait un mot de passe, on peut le garder ou le supprimer
        // Pour simplifier, on le garde mais il ne sera plus utilisé
        await user.save();
      }

      // Vérifier que c'est bien le même compte Google
      if (user.googleId !== googleId) {
        return res.status(400).json({ 
          message: 'Cet email est associé à un autre compte Google' 
        });
      }

      // Générer les tokens
      const { accessToken, refreshToken } = generateTokens(user._id);
      user.refreshToken = refreshToken;
      await user.save();

      // Récupérer l'abonnement si c'est un propriétaire
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

    // Si l'utilisateur n'existe pas - Nouvelle inscription
    // Vérifier si c'est un résident (doit être créé par un propriétaire)
    const existingResident = await User.findOne({ 
      email: email, 
      role: 'resident' 
    });

    if (existingResident) {
      // Si c'est un résident existant, lier son compte Google et le connecter
      if (!existingResident.googleId) {
        existingResident.googleId = googleId;
        existingResident.authMethod = 'google';
        await existingResident.save();
      }

      // Vérifier que c'est bien le même compte Google
      if (existingResident.googleId !== googleId) {
        return res.status(400).json({ 
          message: 'Cet email est associé à un autre compte Google' 
        });
      }

      // Générer les tokens pour le résident
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

    // Pour les nouveaux propriétaires, vérifier qu'on a les informations nécessaires
    if (!telephone) {
      // Utiliser les données Google si disponibles
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

    // Créer le nouveau compte propriétaire
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

    // Vérifier si l'email existe déjà (double vérification)
    const emailExists = await User.findOne({ email: email });
    if (emailExists) {
      return res.status(400).json({ message: 'Cet email est déjà utilisé' });
    }

    // Créer l'utilisateur
    user = new User({
      nom: finalNom,
      prenom: finalPrenom,
      email: email,
      telephone: telephone.trim(),
      googleId: googleId,
      authMethod: 'google',
      role: 'proprietaire',
      // Pas de mot de passe pour les utilisateurs Google
      motDePasse: null
    });

    await user.save();

    // Générer les tokens
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
  forgotPassword
};

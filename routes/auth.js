const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken, requirePasswordChange, requireAdmin } = require('../middlewares/auth');
const usersController = require('../controllers/usersController');

// POST /auth/register - Créer un compte propriétaire
router.post('/register', authController.register);

// POST /auth/login - Connexion
router.post('/login', (req, res, next) => {
  console.log('🔐 [AUTH ROUTE] POST /auth/login appelé');
  console.log('🔐 [AUTH ROUTE] Body:', req.body);
  next();
}, authController.login);

// POST /auth/google - Authentification Google Sign-In
router.post('/google', authController.googleAuth);

// POST /auth/refresh - Rafraîchir le token
router.post('/refresh', authController.refreshToken);

// POST /auth/logout - Déconnexion
router.post('/logout', authenticateToken, authController.logout);

// POST /auth/reset-password - Changement de mot de passe (premier login)
router.post('/reset-password', authenticateToken, requirePasswordChange, authController.resetPassword);

// POST /auth/change-password - Changement de mot de passe normal
router.post('/change-password', authenticateToken, authController.changePassword);

// POST /auth/forgot-password - Mot de passe oublié (sans authentification)
router.post('/forgot-password', authController.forgotPassword);

// GET /auth/me - Récupérer les informations de l'utilisateur connecté
router.get('/me', authenticateToken, authController.getCurrentUser);

// POST /auth/device-token - Enregistrer le token FCM de l'utilisateur
router.post('/device-token', authenticateToken, authController.setDeviceToken);

/**
 * Route admin à ajouter dans un futur UsersController:
 * PATCH /users/:id/make-admin
 * Protégée par requireAdmin
 * Permet de promouvoir un utilisateur au rôle admin
 */
router.patch('/users/:id/make-admin', authenticateToken, requireAdmin, usersController.makeAdmin);

module.exports = router;

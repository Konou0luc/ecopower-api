const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken, requirePasswordChange, requireAdmin } = require('../middlewares/auth');
const usersController = require('../controllers/usersController');

router.post('/register', authController.register);

router.post('/login', (req, res, next) => {
  console.log('🔐 [AUTH ROUTE] POST /auth/login appelé');
  console.log('🔐 [AUTH ROUTE] Body:', req.body);
  next();
}, authController.login);

router.post('/google', authController.googleAuth);

router.post('/refresh', authController.refreshToken);

router.post('/logout', authenticateToken, authController.logout);

router.post('/reset-password', authenticateToken, requirePasswordChange, authController.resetPassword);

router.post('/change-password', authenticateToken, authController.changePassword);

router.post('/forgot-password', authController.forgotPassword);

router.get('/me', authenticateToken, authController.getCurrentUser);

router.post('/device-token', authenticateToken, authController.setDeviceToken);

router.patch('/home-location', authenticateToken, authController.setHomeLocation);

router.delete('/account', authenticateToken, authController.deleteMyAccount);

router.patch('/users/:id/make-admin', authenticateToken, requireAdmin, usersController.makeAdmin);

module.exports = router;

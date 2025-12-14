const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const systemController = require('../controllers/systemController');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');

// Toutes les routes admin nécessitent une authentification et le rôle admin
router.use(authenticateToken);
router.use(requireAdmin);

// Dashboard - Statistiques générales
router.get('/dashboard/stats', adminController.getDashboardStats);

// Gestion des utilisateurs
router.get('/users', adminController.getAllUsers);
router.delete('/users/:id', adminController.deleteUser);

// Gestion des maisons
router.get('/houses', adminController.getAllMaisons);
router.delete('/houses/:id', adminController.deleteMaison);

// Gestion des consommations
router.get('/consumptions', adminController.getAllConsommations);

// Gestion des factures
router.get('/bills', adminController.getAllFactures);

// Gestion des abonnements
router.get('/subscriptions', adminController.getAllAbonnements);

// Gestion des résidents
router.get('/residents', adminController.getResidents);
router.delete('/residents/:id', adminController.deleteResident);

// Gestion des messages
router.get('/messages', adminController.getMessages);

// Gestion des notifications
router.get('/notifications', adminController.getNotifications);

// Gestion des logs
router.get('/logs', adminController.getLogs);

// Informations système
router.get('/system/status', systemController.getSystemStatus);
router.get('/system/info', systemController.getSystemInfo);

// Test des notifications FCM
router.post('/test/notification', adminController.testNotification);

module.exports = router;

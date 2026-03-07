const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const systemController = require('../controllers/systemController');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');


router.use(authenticateToken);
router.use(requireAdmin);


router.get('/dashboard/stats', adminController.getDashboardStats);


router.get('/users', adminController.getAllUsers);
router.get('/users/:id', adminController.getUser);
router.delete('/users/:id', adminController.deleteUser);


router.get('/houses', adminController.getAllMaisons);
router.delete('/houses/:id', adminController.deleteMaison);


router.get('/consumptions', adminController.getAllConsommations);


router.get('/bills', adminController.getAllFactures);


router.get('/subscriptions', adminController.getAllAbonnements);


router.get('/residents', adminController.getResidents);
router.delete('/residents/:id', adminController.deleteResident);


router.get('/messages', adminController.getMessages);


router.get('/notifications', adminController.getNotifications);


router.get('/logs', adminController.getLogs);


router.get('/system/status', systemController.getSystemStatus);
router.get('/system/info', systemController.getSystemInfo);


router.get('/app-info', adminController.getAppInfo);
router.put('/app-info', adminController.updateAppInfo);


router.post('/test/notification', adminController.testNotification);


router.post('/broadcast/notification', adminController.broadcastNotification);

module.exports = router;

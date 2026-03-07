const express = require('express');
const router = express.Router();
const messagesController = require('../controllers/messagesController');
const { authenticateToken } = require('../middlewares/auth');
const { uploadFileMiddleware } = require('../middlewares/upload');


router.post('/', authenticateToken, messagesController.createMessage);


router.post('/file', authenticateToken, uploadFileMiddleware, messagesController.createFileMessage);


router.get('/private/:otherUserId', authenticateToken, messagesController.getPrivateHistory);


router.get('/house/:maisonId', authenticateToken, messagesController.getHouseHistory);


router.get('/file/proxy', messagesController.proxyFile);

module.exports = router;



const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');

// POST /contact - Envoyer un message de contact (sans authentification)
router.post('/', contactController.sendContactMessage);

module.exports = router;


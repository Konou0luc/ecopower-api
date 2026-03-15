const express = require('express');
const router = express.Router();
const maisonsController = require('../controllers/maisonsController');
const { authenticateToken } = require('../middlewares/auth');
const { checkSubscription, checkMaisonQuota } = require('../middlewares/checkSubscription');

router.get('/:id/full', authenticateToken, maisonsController.getMaisonById);

router.use(authenticateToken);

// Appliquer checkSubscription globalement pour les proprios, 
// mais on le fera finement vu que les résidents accèdent aussi à certaines routes.
// Pour la création, c'est que proprio de toute façon.
router.post('/', checkSubscription, checkMaisonQuota, maisonsController.createMaison);


router.get('/', maisonsController.getMaisons);


router.get('/:id', maisonsController.getMaison);


router.put('/:id', maisonsController.updateMaison);


router.delete('/:id', maisonsController.deleteMaison);


router.patch('/:id/tarif', maisonsController.updateMaisonTarif);


router.patch('/:id/configuration', maisonsController.updateMaisonConfiguration);


router.post('/residents/ajouter', maisonsController.addResidentToMaison);


router.post('/residents/retirer', maisonsController.removeResidentFromMaison);

module.exports = router;

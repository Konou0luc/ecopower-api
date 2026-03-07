const express = require('express');
const router = express.Router();
const maisonsController = require('../controllers/maisonsController');
const { authenticateToken } = require('../middlewares/auth');

router.get('/:id/full', authenticateToken, maisonsController.getMaisonById);


router.use(authenticateToken);


router.post('/', maisonsController.createMaison);


router.get('/', maisonsController.getMaisons);


router.get('/:id', maisonsController.getMaison);


router.put('/:id', maisonsController.updateMaison);


router.delete('/:id', maisonsController.deleteMaison);


router.patch('/:id/tarif', maisonsController.updateMaisonTarif);


router.patch('/:id/configuration', maisonsController.updateMaisonConfiguration);


router.post('/residents/ajouter', maisonsController.addResidentToMaison);


router.post('/residents/retirer', maisonsController.removeResidentFromMaison);

module.exports = router;

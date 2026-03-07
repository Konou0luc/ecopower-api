const express = require('express');
const router = express.Router();
const abonnementsController = require('../controllers/abonnementsController');
const { authenticateToken, requireProprietaire, requireAdmin } = require('../middlewares/auth');


router.get('/', abonnementsController.getOffres);


router.use(authenticateToken);
router.use(requireProprietaire);


router.post('/souscrire', abonnementsController.souscrire);


router.post('/renouveler', abonnementsController.renouveler);


router.get('/actuel', abonnementsController.getAbonnementActuel);


router.post('/annuler', abonnementsController.annuler);


router.get('/historique', abonnementsController.getHistorique);


router.patch('/:id/activer', requireAdmin, abonnementsController.activer);
router.patch('/:id/desactiver', requireAdmin, abonnementsController.desactiver);


router.get('/proprietaires', requireAdmin, async (req, res) => {
  try {
    const proprietaires = await require('../models/User').find({ role: 'proprietaire' });
    const result = await Promise.all(proprietaires.map(async (p) => {
      let abonnement = null;
      if (p.abonnementId) {
        abonnement = await require('../models/Abonnement').findById(p.abonnementId);
      }
      return {
        _id: p._id,
        nom: p.nom,
        prenom: p.prenom,
        email: p.email,
        abonnement: abonnement ? { _id: abonnement._id, isActive: abonnement.isActive, statut: abonnement.statut } : null
      };
    }));
    res.json({ proprietaires: result });
  } catch (error) {
    console.error('Erreur liste propriétaires:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;

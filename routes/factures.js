const express = require('express');
const router = express.Router();
const facturesController = require('../controllers/facturesController');
const { authenticateToken } = require('../middlewares/auth');
const { checkSubscription } = require('../middlewares/checkSubscription');


router.use(authenticateToken);


router.use((req, res, next) => {
  
  if ((req.path.startsWith('/my-') || req.path.startsWith('/resident/')) && req.user.role === 'resident') {
    return next();
  }
  
  return checkSubscription(req, res, next);
});


router.post('/generer/:residentId', facturesController.generateFacture);


router.get('/resident/:residentId', facturesController.getFacturesByResident);


router.get('/maison/:maisonId', facturesController.getFacturesByMaison);






router.get('/my-factures', facturesController.getMyFactures);


router.get('/my-maison-factures', facturesController.getMyMaisonFactures);


router.get('/:id', facturesController.getFacture);


router.put('/:id/payer', facturesController.markFactureAsPaid);

module.exports = router;

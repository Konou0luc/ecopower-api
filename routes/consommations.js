const express = require('express');
const router = express.Router();
const consommationsController = require('../controllers/consommationsController');
const { authenticateToken } = require('../middlewares/auth');
const { checkSubscription } = require('../middlewares/checkSubscription');


router.use(authenticateToken);


router.use((req, res, next) => {
  
  if ((req.path.startsWith('/my-') || req.path.startsWith('/resident/')) && req.user.role === 'resident') {
    return next();
  }
  
  return checkSubscription(req, res, next);
});


router.post('/', consommationsController.addConsommation);


router.get('/resident/:residentId', consommationsController.getConsommationsByResident);


router.get('/maison/:maisonId', consommationsController.getConsommationsByMaison);






router.get('/my-consommations', consommationsController.getMyConsommations);


router.get('/my-maison', consommationsController.getMyMaisonConsommations);


router.put('/:id', consommationsController.updateConsommation);


router.delete('/:id', consommationsController.deleteConsommation);

module.exports = router;

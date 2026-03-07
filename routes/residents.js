const express = require('express');
const router = express.Router();
const residentsController = require('../controllers/residentsController');
const { authenticateToken, requireProprietaire } = require('../middlewares/auth');
const { checkSubscription, checkResidentQuota } = require('../middlewares/checkSubscription');


router.get('/my-house', authenticateToken, residentsController.getMyHouseResidents);


router.use(authenticateToken);
router.use(requireProprietaire);
router.use(checkSubscription);


router.post('/', checkResidentQuota, residentsController.addResident);


router.get('/', residentsController.getResidents);


router.get('/:id', residentsController.getResident);


router.put('/:id', residentsController.updateResident);


router.post('/:id/reset-password', residentsController.resetResidentPassword);


router.delete('/:id', residentsController.deleteResident);

module.exports = router;

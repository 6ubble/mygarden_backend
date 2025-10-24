const express = require('express');
const router = express.Router();
const { subscribePush, sendTestNotification, getVapidPublicKey } = require('../controllers/pushController');
const { authenticateToken } = require('../middleware/auth');

router.get('/vapid-key', getVapidPublicKey);
router.post('/subscribe', authenticateToken, subscribePush);
router.post('/test', sendTestNotification);

module.exports = router;
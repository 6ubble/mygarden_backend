const express = require('express');
const router = express.Router();
const { subscribePush, sendTestNotification, getVapidPublicKey } = require('../controllers/pushController');
const { authenticateToken } = require('../middleware/auth');

// Получить VAPID публичный ключ (не требует аутентификации)
router.get('/vapid-key', getVapidPublicKey);

// Сохранить push подписку
router.post('/subscribe', authenticateToken, subscribePush);

// Отправить тестовое уведомление
router.post('/test', sendTestNotification);

module.exports = router;
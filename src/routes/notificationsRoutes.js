const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
    getNotifications,
    getUnreadCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification
} = require('../controllers/notificationsController');

// Все маршруты требуют аутентификации
router.use(authenticateToken);

// Получить все уведомления
router.get('/', getNotifications);

// Получить количество непрочитанных
router.get('/unread-count', getUnreadCount);

// Отметить уведомление как прочитанное
router.put('/:notificationId/read', markNotificationAsRead);

// Отметить все как прочитанные
router.put('/read-all', markAllNotificationsAsRead);

// Удалить уведомление
router.delete('/:notificationId', deleteNotification);

module.exports = router;
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { validatePagination } = require('../middleware/validation');
const {
    getNotifications,
    getUnreadCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification
} = require('../controllers/notificationsController');

router.use(authenticateToken);

router.get('/', validatePagination, getNotifications);
router.get('/unread-count', getUnreadCount);
router.put('/:notificationId/read', markNotificationAsRead);
router.put('/read-all', markAllNotificationsAsRead);
router.delete('/:notificationId', deleteNotification);

module.exports = router;
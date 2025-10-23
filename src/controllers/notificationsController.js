const { getUserNotifications, markAsRead, markAllAsRead, deleteNotification, getUnreadCount } = require('../models/notificationsModel');

class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
    }
}

// Получить все уведомления пользователя
exports.getNotifications = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;

        const notifications = await getUserNotifications(userId, limit, offset);
        const unreadCount = await getUnreadCount(userId);

        res.json({
            notifications,
            unreadCount,
            total: notifications.length
        });
    } catch (error) {
        next(error);
    }
};

// Получить количество непрочитанных
exports.getUnreadCount = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const unreadCount = await getUnreadCount(userId);

        res.json({
            unreadCount
        });
    } catch (error) {
        next(error);
    }
};

// Отметить уведомление как прочитанное
exports.markNotificationAsRead = async (req, res, next) => {
    try {
        const { notificationId } = req.params;

        if (!notificationId) {
            throw new AppError('ID уведомления обязателен', 400);
        }

        await markAsRead(notificationId);

        res.json({
            message: 'Уведомление отмечено как прочитанное'
        });
    } catch (error) {
        next(error);
    }
};

// Отметить все как прочитанные
exports.markAllNotificationsAsRead = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const count = await markAllAsRead(userId);

        res.json({
            message: `${count} уведомлений отмечено как прочитанные`,
            count
        });
    } catch (error) {
        next(error);
    }
};

// Удалить уведомление
exports.deleteNotification = async (req, res, next) => {
    try {
        const { notificationId } = req.params;

        if (!notificationId) {
            throw new AppError('ID уведомления обязателен', 400);
        }

        await deleteNotification(notificationId);

        res.json({
            message: 'Уведомление удалено'
        });
    } catch (error) {
        next(error);
    }
};
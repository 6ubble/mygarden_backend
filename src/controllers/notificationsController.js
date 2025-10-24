const { 
    getUserNotifications, 
    markAsRead, 
    markAllAsRead, 
    deleteNotification, 
    getUnreadCount 
} = require('../models/notificationsModel');

class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
    }
}

exports.getNotifications = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const limit = req.limit;
        const offset = req.offset;

        const notifications = await getUserNotifications(userId, limit, offset);
        const unreadCount = await getUnreadCount(userId);

        res.json({
            notifications,
            unreadCount,
            total: notifications.length,
            limit,
            offset
        });
    } catch (error) {
        next(error);
    }
};

exports.getUnreadCount = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const unreadCount = await getUnreadCount(userId);

        res.json({ unreadCount });
    } catch (error) {
        next(error);
    }
};

exports.markNotificationAsRead = async (req, res, next) => {
    try {
        const { notificationId } = req.params;

        if (!notificationId || isNaN(notificationId)) {
            throw new AppError('ID уведомления невалиден', 400);
        }

        await markAsRead(parseInt(notificationId));

        res.json({ message: 'Уведомление отмечено как прочитанное' });
    } catch (error) {
        next(error);
    }
};

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

exports.deleteNotification = async (req, res, next) => {
    try {
        const { notificationId } = req.params;

        if (!notificationId || isNaN(notificationId)) {
            throw new AppError('ID уведомления невалиден', 400);
        }

        await deleteNotification(parseInt(notificationId));

        res.json({ message: 'Уведомление удалено' });
    } catch (error) {
        next(error);
    }
};
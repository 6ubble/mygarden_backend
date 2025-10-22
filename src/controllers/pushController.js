const webpush = require('web-push');
const { savePushSubscription, deleteSubscription } = require('../models/pushSubscriptionModel');
require('dotenv').config();

// Установи VAPID ключи (см. ниже как их получить)
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:example@domain.com',
        vapidPublicKey,
        vapidPrivateKey
    );
}

class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
    }
}

// Сохранить push подписку
exports.subscribePush = async (req, res, next) => {
    try {
        const { subscription, latitude, longitude } = req.body;
        const userId = req.user.id;

        if (!subscription || !subscription.endpoint) {
            throw new AppError('Некорректная подписка', 400);
        }

        await savePushSubscription(userId, subscription, latitude, longitude);

        res.json({ 
            message: 'Push подписка сохранена',
            subscribed: true 
        });
    } catch (error) {
        next(error);
    }
};

// Отправить тестовое уведомление
exports.sendTestNotification = async (req, res, next) => {
    try {
        const subscription = req.body.subscription;

        if (!subscription || !subscription.endpoint) {
            throw new AppError('Некорректная подписка', 400);
        }

        const notification = {
            title: '🧪 Тестовое уведомление',
            body: 'Push уведомления работают!',
            icon: '/garden-icon.png',
            badge: '/garden-badge.png'
        };

        await webpush.sendNotification(
            subscription,
            JSON.stringify(notification)
        );

        console.log('✅ Тестовое уведомление отправлено');
        res.json({ message: 'Уведомление отправлено' });
    } catch (error) {
        if (error.statusCode === 410) {
            // Подписка больше не валидна
            console.log('🗑️ Подписка истекла, удаляем');
            // Можно удалить из БД
        }
        next(error);
    }
};

// Получить VAPID публичный ключ
exports.getVapidPublicKey = (req, res) => {
    if (!vapidPublicKey) {
        return res.status(500).json({ 
            error: 'VAPID ключи не настроены' 
        });
    }

    res.json({ 
        vapidPublicKey 
    });
};

module.exports.webpush = webpush;
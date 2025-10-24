const webpush = require('web-push');
const { savePushSubscription, deleteSubscription } = require('../models/pushSubscriptionModel');
require('dotenv').config();

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

const validateSubscription = (subscription) => {
    return subscription && 
           subscription.endpoint && 
           subscription.keys && 
           subscription.keys.p256dh && 
           subscription.keys.auth;
};

exports.subscribePush = async (req, res, next) => {
    try {
        const { subscription, latitude, longitude } = req.body;
        const userId = req.user.id;

        if (!subscription) {
            throw new AppError('Подписка обязательна', 400);
        }

        if (!validateSubscription(subscription)) {
            throw new AppError('Некорректная подписка', 400);
        }

        const lat = parseFloat(latitude);
        const lon = parseFloat(longitude);

        if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
            throw new AppError('Некорректные координаты', 400);
        }

        await savePushSubscription(userId, subscription, lat, lon);

        res.status(201).json({ 
            message: 'Push подписка сохранена',
            subscribed: true 
        });
    } catch (error) {
        next(error);
    }
};

exports.sendTestNotification = async (req, res, next) => {
    try {
        const { subscription } = req.body;

        if (!validateSubscription(subscription)) {
            throw new AppError('Некорректная подписка', 400);
        }

        const notification = {
            title: 'Тестовое уведомление',
            body: 'Push уведомления работают!',
            icon: '/garden-icon.png',
            badge: '/garden-badge.png'
        };

        await webpush.sendNotification(
            subscription,
            JSON.stringify(notification)
        );

        res.json({ message: 'Уведомление отправлено' });
    } catch (error) {
        if (error.statusCode === 410) {
            return res.status(410).json({ message: 'Подписка истекла' });
        }
        next(error);
    }
};

exports.getVapidPublicKey = (req, res) => {
    if (!vapidPublicKey) {
        return res.status(500).json({ 
            error: 'VAPID ключи не настроены' 
        });
    }

    res.json({ vapidPublicKey });
};
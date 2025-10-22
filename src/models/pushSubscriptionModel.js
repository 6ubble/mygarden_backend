const pool = require('../config/db');

// Сохранить push подписку пользователя
exports.savePushSubscription = async (userId, subscription, latitude, longitude) => {
    try {
        const subscriptionJson = JSON.stringify(subscription);
        
        const [existing] = await pool.query(
            'SELECT id FROM user_push_subscriptions WHERE user_id = ? AND endpoint = ?',
            [userId, subscription.endpoint]
        );

        if (existing.length > 0) {
            // Обновляем существующую подписку
            await pool.query(
                'UPDATE user_push_subscriptions SET subscription = ?, latitude = ?, longitude = ?, updated_at = NOW() WHERE user_id = ? AND endpoint = ?',
                [subscriptionJson, latitude, longitude, userId, subscription.endpoint]
            );
        } else {
            // Создаем новую подписку
            await pool.query(
                'INSERT INTO user_push_subscriptions (user_id, subscription, endpoint, latitude, longitude, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
                [userId, subscriptionJson, subscription.endpoint, latitude, longitude]
            );
        }

        console.log(`✅ Push подписка сохранена для пользователя ${userId}`);
        return true;
    } catch (error) {
        console.error('Ошибка при сохранении push подписки:', error);
        throw error;
    }
};

// Получить все подписки для координат (для отправки уведомлений)
exports.getSubscriptionsByCoordinates = async (latitude, longitude, radiusKm = 1) => {
    try {
        // Используем приблизительное расстояние (плюс-минус radiusKm км)
        const latDelta = radiusKm / 111; // 1 градус широты ≈ 111км
        const lonDelta = radiusKm / (111 * Math.cos(latitude * Math.PI / 180));

        const [subscriptions] = await pool.query(
            `SELECT user_id, subscription, latitude, longitude 
             FROM user_push_subscriptions 
             WHERE latitude BETWEEN ? AND ? 
             AND longitude BETWEEN ? AND ?
             AND subscription IS NOT NULL`,
            [
                latitude - latDelta,
                latitude + latDelta,
                longitude - lonDelta,
                longitude + lonDelta
            ]
        );

        console.log(`📍 Найдено ${subscriptions.length} подписок для координат`);
        return subscriptions;
    } catch (error) {
        console.error('Ошибка при получении подписок:', error);
        throw error;
    }
};

// Удалить подписку (если она невалидна)
exports.deleteSubscription = async (userId, endpoint) => {
    try {
        await pool.query(
            'DELETE FROM user_push_subscriptions WHERE user_id = ? AND endpoint = ?',
            [userId, endpoint]
        );

        console.log(`🗑️ Подписка удалена для пользователя ${userId}`);
    } catch (error) {
        console.error('Ошибка при удалении подписки:', error);
        throw error;
    }
};

// Получить все подписки пользователя
exports.getUserSubscriptions = async (userId) => {
    try {
        const [subscriptions] = await pool.query(
            'SELECT subscription FROM user_push_subscriptions WHERE user_id = ? AND subscription IS NOT NULL',
            [userId]
        );

        return subscriptions.map(s => JSON.parse(s.subscription));
    } catch (error) {
        console.error('Ошибка при получении подписок пользователя:', error);
        throw error;
    }
};
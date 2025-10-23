const pool = require('../config/db');

// Сохранить уведомление для пользователя
exports.saveNotification = async (userId, title, body, type, data = null) => {
    try {
        const dataJson = data ? JSON.stringify(data) : null;
        
        const [result] = await pool.query(
            'INSERT INTO notifications (user_id, title, body, type, data) VALUES (?, ?, ?, ?, ?)',
            [userId, title, body, type, dataJson]
        );

        console.log(`📨 Уведомление сохранено для пользователя ${userId}`);
        return result.insertId;
    } catch (error) {
        console.error('Ошибка при сохранении уведомления:', error);
        throw error;
    }
};

// Получить все уведомления пользователя
exports.getUserNotifications = async (userId, limit = 50, offset = 0) => {
    try {
        const [notifications] = await pool.query(
            `SELECT id, title, body, type, data, is_read, created_at 
             FROM notifications 
             WHERE user_id = ? 
             ORDER BY created_at DESC 
             LIMIT ? OFFSET ?`,
            [userId, limit, offset]
        );

        return notifications.map(n => ({
            ...n,
            is_read: n.is_read ? true : false,
            data: typeof n.data === 'string' ? JSON.parse(n.data) : n.data
        }));
    } catch (error) {
        console.error('Ошибка при получении уведомлений:', error);
        throw error;
    }
};

// Получить непрочитанные уведомления
exports.getUnreadNotifications = async (userId) => {
    try {
        const [notifications] = await pool.query(
            `SELECT id, title, body, type, data, created_at 
             FROM notifications 
             WHERE user_id = ? AND is_read = FALSE 
             ORDER BY created_at DESC`,
            [userId]
        );

        return notifications.map(n => ({
            ...n,
            data: n.data ? JSON.parse(n.data) : null
        }));
    } catch (error) {
        console.error('Ошибка при получении непрочитанных уведомлений:', error);
        throw error;
    }
};

// Отметить уведомление как прочитанное
exports.markAsRead = async (notificationId) => {
    try {
        await pool.query(
            'UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE id = ?',
            [notificationId]
        );

        console.log(`✅ Уведомление ${notificationId} отмечено как прочитанное`);
    } catch (error) {
        console.error('Ошибка при отметке уведомления:', error);
        throw error;
    }
};

// Отметить все уведомления как прочитанные
exports.markAllAsRead = async (userId) => {
    try {
        const [result] = await pool.query(
            'UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE user_id = ? AND is_read = FALSE',
            [userId]
        );

        console.log(`✅ Отмечено как прочитанные ${result.affectedRows} уведомлений`);
        return result.affectedRows;
    } catch (error) {
        console.error('Ошибка при отметке всех уведомлений:', error);
        throw error;
    }
};

// Удалить уведомление
exports.deleteNotification = async (notificationId) => {
    try {
        await pool.query(
            'DELETE FROM notifications WHERE id = ?',
            [notificationId]
        );

        console.log(`🗑️ Уведомление ${notificationId} удалено`);
    } catch (error) {
        console.error('Ошибка при удалении уведомления:', error);
        throw error;
    }
};

// Получить количество непрочитанных
exports.getUnreadCount = async (userId) => {
    try {
        const [result] = await pool.query(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE',
            [userId]
        );

        return result[0].count;
    } catch (error) {
        console.error('Ошибка при получении количества:', error);
        throw error;
    }
};
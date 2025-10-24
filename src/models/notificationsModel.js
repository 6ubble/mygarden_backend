const pool = require('../config/db');

exports.saveNotification = async (userId, title, body, type, data = null) => {
    try {
        const dataJson = data ? JSON.stringify(data) : null;
        
        const [result] = await pool.query(
            'INSERT INTO notifications (user_id, title, body, type, data) VALUES (?, ?, ?, ?, ?)',
            [userId, title, body, type, dataJson]
        );

        return result.insertId;
    } catch (error) {
        console.error('Ошибка при сохранении уведомления:', error);
        throw error;
    }
};

// Batch insert для множественных уведомлений
exports.saveNotificationsBatch = async (notifications) => {
    if (!notifications || notifications.length === 0) return [];
    
    try {
        const values = notifications.map(n => [
            n.userId,
            n.title,
            n.body,
            n.type,
            n.data ? JSON.stringify(n.data) : null
        ]);

        const query = 'INSERT INTO notifications (user_id, title, body, type, data) VALUES ?';
        const [result] = await pool.query(query, [values]);

        return result.affectedRows;
    } catch (error) {
        console.error('Ошибка при batch сохранении уведомлений:', error);
        throw error;
    }
};

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
            is_read: !!n.is_read,
            data: typeof n.data === 'string' ? JSON.parse(n.data) : n.data
        }));
    } catch (error) {
        console.error('Ошибка при получении уведомлений:', error);
        throw error;
    }
};

exports.getUnreadCount = async (userId) => {
    try {
        const [result] = await pool.query(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE',
            [userId]
        );

        return result[0]?.count || 0;
    } catch (error) {
        console.error('Ошибка при получении количества:', error);
        throw error;
    }
};

exports.markAsRead = async (notificationId) => {
    try {
        await pool.query(
            'UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE id = ?',
            [notificationId]
        );
    } catch (error) {
        console.error('Ошибка при отметке уведомления:', error);
        throw error;
    }
};

exports.markAllAsRead = async (userId) => {
    try {
        const [result] = await pool.query(
            'UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE user_id = ? AND is_read = FALSE',
            [userId]
        );

        return result.affectedRows;
    } catch (error) {
        console.error('Ошибка при отметке всех уведомлений:', error);
        throw error;
    }
};

exports.deleteNotification = async (notificationId) => {
    try {
        await pool.query(
            'DELETE FROM notifications WHERE id = ?',
            [notificationId]
        );
    } catch (error) {
        console.error('Ошибка при удалении уведомления:', error);
        throw error;
    }
};
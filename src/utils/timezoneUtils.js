const moment = require('moment-timezone');
const geoTz = require('geo-tz');

/**
 * Получить часовой пояс по координатам
 * @param {number} latitude
 * @param {number} longitude
 * @returns {string} - Например: 'Asia/Yekaterinburg'
 */
const getTimezoneByCoordinates = (latitude, longitude) => {
    try {
        // geo-tz.find() возвращает массив или undefined
        const timezone = geoTz.find(latitude, longitude);
        
        if (Array.isArray(timezone) && timezone.length > 0) {
            return timezone[0];
        } else if (typeof timezone === 'string') {
            return timezone;
        }
        
        console.warn(`⚠️ geo-tz вернул неожиданный результат: ${timezone}`);
        return 'UTC';
    } catch (error) {
        console.warn(`⚠️ Ошибка при определении часового пояса: ${error.message}, используем UTC`);
        return 'UTC';
    }
};

/**
 * Конвертировать Unix timestamp в локальное время (по координатам)
 * @param {number} unixTimestamp - Unix время в секундах
 * @param {number} latitude
 * @param {number} longitude
 * @param {string} format - Формат (по умолчанию 'HH:mm')
 * @returns {string} - Локальное время в нужном формате
 */
const convertToLocalTime = (unixTimestamp, latitude, longitude, format = 'HH:mm') => {
    const timezone = getTimezoneByCoordinates(latitude, longitude);
    return moment.unix(unixTimestamp).tz(timezone).format(format);
};

/**
 * Получить завтрашнюю ночь (00:00 - 06:00) в локальном времени (по координатам)
 * @param {number} latitude
 * @param {number} longitude
 * @returns {object} - { startUnix, endUnix, startLocal, endLocal, timezone }
 */
const getTomorrowNightInLocalTimezone = (latitude, longitude) => {
    const timezone = getTimezoneByCoordinates(latitude, longitude);
    const now = moment().tz(timezone);
    const tomorrowStart = now.clone().add(1, 'day').startOf('day');
    const tomorrowEnd = tomorrowStart.clone().add(6, 'hours');

    return {
        startUnix: tomorrowStart.unix(),
        endUnix: tomorrowEnd.unix(),
        startLocal: tomorrowStart.format('YYYY-MM-DD HH:mm'),
        endLocal: tomorrowEnd.format('YYYY-MM-DD HH:mm'),
        timezone
    };
};

/**
 * Получить текущее время в локальном часовом поясе (по координатам)
 * @param {number} latitude
 * @param {number} longitude
 * @param {string} format - Формат
 * @returns {string}
 */
const getNowInLocalTimezone = (latitude, longitude, format = 'YYYY-MM-DD HH:mm:ss') => {
    const timezone = getTimezoneByCoordinates(latitude, longitude);
    return moment().tz(timezone).format(format);
};

/**
 * Проверить, попадает ли Unix timestamp в промежуток завтрашней ночи
 * @param {number} unixTimestamp
 * @param {number} latitude
 * @param {number} longitude
 * @returns {boolean}
 */
const isInTomorrowNight = (unixTimestamp, latitude, longitude) => {
    const night = getTomorrowNightInLocalTimezone(latitude, longitude);
    return unixTimestamp >= night.startUnix && unixTimestamp <= night.endUnix;
};

/**
 * Преобразовать дату в Unix timestamp в локальном часовом поясе
 * @param {string} dateString - Например: '2024-01-15 03:00'
 * @param {number} latitude
 * @param {number} longitude
 * @returns {number} - Unix timestamp
 */
const dateToUnix = (dateString, latitude, longitude) => {
    const timezone = getTimezoneByCoordinates(latitude, longitude);
    return moment.tz(dateString, timezone).unix();
};

module.exports = {
    getTimezoneByCoordinates,
    convertToLocalTime,
    getTomorrowNightInLocalTimezone,
    getNowInLocalTimezone,
    isInTomorrowNight,
    dateToUnix
};
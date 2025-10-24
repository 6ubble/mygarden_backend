const moment = require('moment-timezone');
const geoTz = require('geo-tz');

const timezoneCache = new Map();
const TIMEZONE_CACHE_TTL = 24 * 60 * 60 * 1000;

const getCacheKey = (latitude, longitude) => {
    return `${Math.round(latitude * 100) / 100},${Math.round(longitude * 100) / 100}`;
};

const getTimezoneByCoordinates = (latitude, longitude) => {
    const key = getCacheKey(latitude, longitude);
    
    if (timezoneCache.has(key)) {
        const cached = timezoneCache.get(key);
        if (Date.now() - cached.timestamp < TIMEZONE_CACHE_TTL) {
            return cached.timezone;
        }
        timezoneCache.delete(key);
    }

    try {
        const timezone = geoTz.find(latitude, longitude);
        const tz = Array.isArray(timezone) ? timezone[0] : timezone;
        
        timezoneCache.set(key, {
            timezone: tz || 'UTC',
            timestamp: Date.now()
        });

        return tz || 'UTC';
    } catch (error) {
        console.error('Ошибка при определении часового пояса:', error.message);
        return 'UTC';
    }
};

const convertToLocalTime = (unixTimestamp, latitude, longitude, format = 'HH:mm') => {
    const timezone = getTimezoneByCoordinates(latitude, longitude);
    return moment.unix(unixTimestamp).tz(timezone).format(format);
};

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

const getNowInLocalTimezone = (latitude, longitude, format = 'YYYY-MM-DD HH:mm:ss') => {
    const timezone = getTimezoneByCoordinates(latitude, longitude);
    return moment().tz(timezone).format(format);
};

const isInTomorrowNight = (unixTimestamp, latitude, longitude) => {
    const night = getTomorrowNightInLocalTimezone(latitude, longitude);
    return unixTimestamp >= night.startUnix && unixTimestamp <= night.endUnix;
};

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
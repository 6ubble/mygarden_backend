const axios = require('axios');
const cron = require('node-cron');
const webpush = require('web-push');
const { getSubscriptionsByCoordinates } = require('../models/pushSubscriptionModel');
const { saveNotificationsBatch } = require('../models/notificationsModel');
const { getTimezoneByCoordinates, convertToLocalTime } = require('../utils/timezoneUtils');
const { checkHeatWarning, checkRainWarning, getWateringRecommendation } = require('../utils/weatherAlertsUtils');
require('dotenv').config();

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const FROST_THRESHOLD = 10;

const alertsCache = new Map();
const alertsCronTasks = new Map();

class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
    }
}

const fetchAllAlertsData = async (lat, lon) => {
    try {
        const timezone = getTimezoneByCoordinates(lat, lon);

        const response = await axios.get(
            `https://api.openweathermap.org/data/2.5/forecast`,
            {
                params: {
                    lat,
                    lon,
                    appid: OPENWEATHER_API_KEY,
                    units: 'metric',
                    lang: 'ru'
                },
                timeout: 10000
            }
        );

        const now = new Date();
        
        const nightStart = new Date(now);
        nightStart.setDate(nightStart.getDate() + 1);
        nightStart.setHours(0, 0, 0, 0);
        const nightEnd = new Date(nightStart);
        nightEnd.setHours(6, 0, 0, 0);
        
        const dayStart = new Date(nightStart);
        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59, 999);

        const nightStartUnix = Math.floor(nightStart.getTime() / 1000);
        const nightEndUnix = Math.floor(nightEnd.getTime() / 1000);
        const dayStartUnix = Math.floor(dayStart.getTime() / 1000);
        const dayEndUnix = Math.floor(dayEnd.getTime() / 1000);

        const nightForecasts = response.data.list.filter(item => 
            item.dt >= nightStartUnix && item.dt <= nightEndUnix
        );

        const dayForecasts = response.data.list.filter(item => 
            item.dt >= dayStartUnix && item.dt <= dayEndUnix
        );

        if (nightForecasts.length === 0 || dayForecasts.length === 0) {
            return null;
        }

        const coldestHour = nightForecasts.reduce((coldest, current) => {
            return current.main.temp < coldest.main.temp ? current : coldest;
        });
        const frostLocalTime = convertToLocalTime(coldestHour.dt, lat, lon, 'HH:mm');

        const heat = checkHeatWarning(dayForecasts);
        const rain = checkRainWarning(dayForecasts);
        const wateringRec = getWateringRecommendation(heat, rain);

        return {
            city: response.data.city.name,
            timezone,
            timestamp: Date.now(),
            
            frost: {
                temp: Math.round(coldestHour.main.temp),
                time: frostLocalTime,
                isFrost: coldestHour.main.temp <= FROST_THRESHOLD,
                description: coldestHour.weather[0].description,
                humidity: coldestHour.main.humidity
            },

            heat,
            rain,
            watering: wateringRec
        };
    } catch (error) {
        console.error(`Ошибка при запросе alert'ов: ${error.message}`);
        throw error;
    }
};

const sendAllNotifications = async (alerts, lat, lon) => {
    try {
        const subscriptions = await getSubscriptionsByCoordinates(lat, lon, 2);

        if (subscriptions.length === 0) {
            return;
        }

        const notificationsToSave = [];
        const pushPromises = [];

        for (const sub of subscriptions) {
            try {
                const parsedSubscription = typeof sub.subscription === 'string'
                    ? JSON.parse(sub.subscription)
                    : sub.subscription;

                if (alerts.frost.isFrost) {
                    const pushData = {
                        title: `Заморозки в ${alerts.city}!`,
                        body: `В ${alerts.frost.time} температура упадет до ${alerts.frost.temp}°C. Защитите растения!`,
                        icon: '/garden-icon.png',
                        badge: '/garden-badge.png',
                        tag: 'frost-alert',
                        requireInteraction: true,
                        data: { city: alerts.city }
                    };

                    pushPromises.push(
                        webpush.sendNotification(parsedSubscription, JSON.stringify(pushData))
                            .catch(err => {
                                if (err.statusCode !== 410) throw err;
                            })
                    );

                    notificationsToSave.push({
                        userId: sub.user_id,
                        title: pushData.title,
                        body: pushData.body,
                        type: 'frost',
                        data: { city: alerts.city }
                    });
                }

                if (alerts.watering.recommendation) {
                    const pushData = {
                        title: `Рекомендация по поливу`,
                        body: alerts.watering.recommendation,
                        icon: '/garden-icon.png',
                        badge: '/garden-badge.png',
                        tag: 'watering-alert',
                        requireInteraction: false,
                        data: { city: alerts.city }
                    };

                    pushPromises.push(
                        webpush.sendNotification(parsedSubscription, JSON.stringify(pushData))
                            .catch(err => {
                                if (err.statusCode !== 410) throw err;
                            })
                    );

                    notificationsToSave.push({
                        userId: sub.user_id,
                        title: pushData.title,
                        body: pushData.body,
                        type: alerts.rain.isRain ? 'rain' : (alerts.heat.isHeat ? 'heat' : 'watering'),
                        data: { city: alerts.city }
                    });
                }
            } catch (error) {
                console.error('Ошибка при обработке подписки:', error.message);
            }
        }

        await Promise.all(pushPromises);
        if (notificationsToSave.length > 0) {
            await saveNotificationsBatch(notificationsToSave);
        }

    } catch (error) {
        console.error(`Ошибка при отправке уведомлений: ${error.message}`);
    }
};

const checkAndNotifyAllAlerts = async (lat, lon) => {
    try {
        const cacheKey = `${Math.round(lat * 100) / 100},${Math.round(lon * 100) / 100}`;
        const alerts = await fetchAllAlertsData(lat, lon);

        if (!alerts) {
            return null;
        }

        alertsCache.set(cacheKey, alerts);

        await sendAllNotifications(alerts, lat, lon);

        return alerts;
    } catch (error) {
        console.error(`Ошибка при проверке alert'ов: ${error.message}`);
        throw error;
    }
};

const scheduleAlertsCheck = (lat, lon) => {
    const cacheKey = `${Math.round(lat * 100) / 100},${Math.round(lon * 100) / 100}`;

    if (alertsCronTasks.has(cacheKey)) {
        return;
    }

    const timezone = getTimezoneByCoordinates(lat, lon);

    const task = cron.schedule(
        '0 12 * * *',
        async () => {
            await checkAndNotifyAllAlerts(lat, lon);
        },
        { timezone }
    );

    alertsCronTasks.set(cacheKey, task);
};

exports.getAllAlerts = async (req, res, next) => {
    try {
        const { latitude, longitude } = req.query;

        if (!latitude || !longitude) {
            throw new AppError('Координаты обязательны', 400);
        }

        const lat = parseFloat(latitude);
        const lon = parseFloat(longitude);

        if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
            throw new AppError('Некорректные координаты', 400);
        }

        const cacheKey = `${Math.round(lat * 100) / 100},${Math.round(lon * 100) / 100}`;

        if (alertsCache.has(cacheKey)) {
            const cached = alertsCache.get(cacheKey);
            return res.json({
                ...cached,
                fromCache: true
            });
        }

        const alerts = await checkAndNotifyAllAlerts(lat, lon);
        scheduleAlertsCheck(lat, lon);

        res.json({
            ...alerts,
            fromCache: false
        });
    } catch (error) {
        next(error);
    }
};

exports.testAlert = async (req, res, next) => {
    try {
        const { latitude, longitude } = req.body;

        if (!latitude || !longitude) {
            throw new AppError('Координаты обязательны', 400);
        }

        const lat = parseFloat(latitude);
        const lon = parseFloat(longitude);

        const alerts = await checkAndNotifyAllAlerts(lat, lon);

        res.json({
            message: 'Alert\'ы отправлены',
            alerts
        });
    } catch (error) {
        next(error);
    }
};

exports.stopAllAlertsSchedules = () => {
    alertsCronTasks.forEach((task) => {
        task.stop();
    });
    alertsCronTasks.clear();
};

exports.scheduleAlertsCheck = scheduleAlertsCheck;
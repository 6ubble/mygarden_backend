const axios = require('axios');
const cron = require('node-cron');
const webpush = require('web-push');
const { getSubscriptionsByCoordinates } = require('../models/pushSubscriptionModel');
const { getTomorrowNightInLocalTimezone, convertToLocalTime, getTimezoneByCoordinates } = require('../utils/timezoneUtils');
const { checkHeatWarning, checkRainWarning, getWateringRecommendation } = require('../utils/weatherAlertsUtils');
require('dotenv').config();

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const FROST_THRESHOLD = 0;

// Кэш для всех alert'ов
const alertsCache = new Map();

// Активные cron задачи
const alertsCronTasks = new Map();

class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
    }
}

// ЕДИНЫЙ запрос для всех alert'ов
const fetchAllAlertsData = async (lat, lon) => {
    try {
        const timezone = getTimezoneByCoordinates(lat, lon);

        // Один запрос вместо трёх!
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

        // Вычисляем время завтрашней ночи и дня
        const now = new Date();
        
        // Ночь: 00:00 - 06:00
        const nightStart = new Date(now);
        nightStart.setDate(nightStart.getDate() + 1);
        nightStart.setHours(0, 0, 0, 0);
        const nightEnd = new Date(nightStart);
        nightEnd.setHours(6, 0, 0, 0);
        
        // Весь день: 00:00 - 23:59
        const dayStart = new Date(nightStart);
        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59, 999);

        const nightStartUnix = Math.floor(nightStart.getTime() / 1000);
        const nightEndUnix = Math.floor(nightEnd.getTime() / 1000);
        const dayStartUnix = Math.floor(dayStart.getTime() / 1000);
        const dayEndUnix = Math.floor(dayEnd.getTime() / 1000);

        // Фильтруем данные
        const nightForecasts = response.data.list.filter(item => 
            item.dt >= nightStartUnix && item.dt <= nightEndUnix
        );

        const dayForecasts = response.data.list.filter(item => 
            item.dt >= dayStartUnix && item.dt <= dayEndUnix
        );

        if (nightForecasts.length === 0 || dayForecasts.length === 0) {
            return null;
        }

        // ======== ЗАМОРОЗКИ (ночь) ========
        const coldestHour = nightForecasts.reduce((coldest, current) => {
            return current.main.temp < coldest.main.temp ? current : coldest;
        });
        const frostLocalTime = convertToLocalTime(coldestHour.dt, lat, lon, 'HH:mm');

        // ======== ЖАРА И ДОЖДЬ (день) ========
        const heat = checkHeatWarning(dayForecasts);
        const rain = checkRainWarning(dayForecasts);
        const wateringRec = getWateringRecommendation(heat, rain);

        return {
            city: response.data.city.name,
            timezone,
            timestamp: Date.now(),
            
            // Заморозки
            frost: {
                temp: Math.round(coldestHour.main.temp),
                time: frostLocalTime,
                isFrost: coldestHour.main.temp <= FROST_THRESHOLD,
                description: coldestHour.weather[0].description,
                humidity: coldestHour.main.humidity
            },

            // Жара и дождь
            heat,
            rain,
            watering: wateringRec
        };
    } catch (error) {
        console.error(`❌ Ошибка при запросе alert'ов: ${error.message}`);
        throw error;
    }
};

// Проверка и отправка всех alert'ов
const checkAndNotifyAllAlerts = async (lat, lon) => {
    try {
        const cacheKey = `${Math.round(lat * 100) / 100},${Math.round(lon * 100) / 100}`;
        const alerts = await fetchAllAlertsData(lat, lon);

        if (!alerts) {
            console.log(`⚠️ Нет прогноза для ${cacheKey}`);
            return null;
        }

        alertsCache.set(cacheKey, alerts);

        // Логирование
        if (alerts.frost.isFrost) {
            console.log(`🧊 ЗАМОРОЗКИ: В ${alerts.city} ночью ${alerts.frost.time} температура ${alerts.frost.temp}°C`);
        }

        if (alerts.rain.isRain) {
            console.log(`🌧️ ДОЖДЬ: В ${alerts.city} завтра ${alerts.rain.totalRain}мм осадков`);
        } else if (alerts.heat.isHeat) {
            console.log(`☀️ ЖАРА: В ${alerts.city} завтра до ${alerts.heat.maxTemp}°C`);
        }

        // Отправляем все уведомления пакетом
        await sendAllNotifications(alerts, lat, lon);

        return alerts;
    } catch (error) {
        console.error(`❌ Ошибка при проверке alert'ов: ${error.message}`);
        throw error;
    }
};

// Отправка всех уведомлений
const sendAllNotifications = async (alerts, lat, lon) => {
    try {
        const subscriptions = await getSubscriptionsByCoordinates(lat, lon, 2);

        if (subscriptions.length === 0) {
            console.log(`📢 Alert'ы готовы, но нет подписчиков`);
            return;
        }

        // Создаём уведомления
        const notifications = [];

        if (alerts.frost.isFrost) {
            notifications.push({
                title: `🧊 Заморозки в ${alerts.city}!`,
                body: `В ${alerts.frost.time} температура упадет до ${alerts.frost.temp}°C. Защитите растения!`,
                tag: 'frost-alert',
                requireInteraction: true
            });
        }

        if (alerts.watering.recommendation) {
            notifications.push({
                title: `${alerts.watering.emoji} Рекомендация по поливу`,
                body: alerts.watering.recommendation,
                tag: 'watering-alert',
                requireInteraction: false
            });
        }

        // Отправляем все уведомления
        let sent = 0;
        let failed = 0;

        for (const sub of subscriptions) {
            try {
                const parsedSubscription = typeof sub.subscription === 'string'
                    ? JSON.parse(sub.subscription)
                    : sub.subscription;

                for (const notif of notifications) {
                    await webpush.sendNotification(
                        parsedSubscription,
                        JSON.stringify({
                            ...notif,
                            icon: '/garden-icon.png',
                            badge: '/garden-badge.png',
                            data: { city: alerts.city }
                        })
                    );
                }
                sent += notifications.length;
            } catch (error) {
                if (error.statusCode === 410) {
                    console.log(`🗑️ Подписка истекла`);
                }
                failed += notifications.length;
            }
        }

        console.log(`📤 Уведомлений отправлено: ${sent} успешно, ${failed} ошибок`);
    } catch (error) {
        console.error(`❌ Ошибка при отправке уведомлений: ${error.message}`);
    }
};

// Запуск планировщика
const scheduleAlertsCheck = (lat, lon) => {
    const cacheKey = `${Math.round(lat * 100) / 100},${Math.round(lon * 100) / 100}`;

    if (alertsCronTasks.has(cacheKey)) {
        return;
    }

    const timezone = getTimezoneByCoordinates(lat, lon);

    // Одна cron задача вместо двух!
    const task = cron.schedule(
        '0 12 * * *',  // 12:00 каждый день
        async () => {
            console.log(`⏰ Проверка всех alert'ов в 12:00 для ${cacheKey}`);
            await checkAndNotifyAllAlerts(lat, lon);
        },
        {
            timezone
        }
    );

    alertsCronTasks.set(cacheKey, task);
    console.log(`📅 Планировщик alert'ов запущен для ${cacheKey} (часовой пояс: ${timezone})`);
};

// API endpoint - единый для всех alert'ов
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

        // Проверяем кэш
        if (alertsCache.has(cacheKey)) {
            const cached = alertsCache.get(cacheKey);
            return res.json({
                ...cached,
                fromCache: true
            });
        }

        // Запрашиваем
        const alerts = await checkAndNotifyAllAlerts(lat, lon);

        // Запускаем планировщик
        scheduleAlertsCheck(lat, lon);

        res.json({
            ...alerts,
            fromCache: false
        });
    } catch (error) {
        next(error);
    }
};

// Остановка всех планировщиков
exports.stopAllAlertsSchedules = () => {
    alertsCronTasks.forEach((task) => {
        task.stop();
    });
    alertsCronTasks.clear();
    console.log('🛑 Все планировщики alert\'ов остановлены');
};

exports.scheduleAlertsCheck = scheduleAlertsCheck;
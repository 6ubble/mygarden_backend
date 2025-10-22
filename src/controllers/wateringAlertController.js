const axios = require('axios');
const cron = require('node-cron');
const webpush = require('web-push');
const { getSubscriptionsByCoordinates } = require('../models/pushSubscriptionModel');
const { getTomorrowNightInLocalTimezone, convertToLocalTime, getTimezoneByCoordinates } = require('../utils/timezoneUtils');
const { checkHeatWarning, checkRainWarning, getWateringRecommendation } = require('../utils/weatherAlertsUtils');
require('dotenv').config();

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

// Кэш для хранения информации о поливе
const wateringAlertCache = new Map();

// Активные cron задачи
const wateringCronTasks = new Map();

class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
    }
}

// Функция для получения часового пояса по координатам
const getTimezoneByCoords = (lat, lon) => {
    try {
        const tzlookup = require('tzlookup');
        return tzlookup(lat, lon) || 'UTC';
    } catch (error) {
        console.warn(`⚠️ Ошибка при определении часового пояса: ${error.message}`);
        return 'UTC';
    }
};

// Функция для запроса прогноза на завтрашний день
const fetchTomorrowForecast = async (lat, lon) => {
    try {
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

        const timezone = getTimezoneByCoords(lat, lon);

        // Получаем Unix timestamps для завтрашнего дня (00:00 - 23:59)
        const now = new Date();
        const tomorrowStart = new Date(now);
        tomorrowStart.setDate(tomorrowStart.getDate() + 1);
        tomorrowStart.setHours(0, 0, 0, 0);
        
        const tomorrowEnd = new Date(tomorrowStart);
        tomorrowEnd.setHours(23, 59, 59, 999);

        const startUnix = Math.floor(tomorrowStart.getTime() / 1000);
        const endUnix = Math.floor(tomorrowEnd.getTime() / 1000);

        // Фильтруем прогноз только на завтрашний день
        const tomorrowForecasts = response.data.list.filter(item => {
            return item.dt >= startUnix && item.dt <= endUnix;
        });

        if (tomorrowForecasts.length === 0) {
            return null;
        }

        // Проверяем жару и дождь
        const heat = checkHeatWarning(tomorrowForecasts);
        const rain = checkRainWarning(tomorrowForecasts);
        const recommendation = getWateringRecommendation(heat, rain);

        return {
            city: response.data.city.name,
            timezone,
            heat,
            rain,
            recommendation,
            timestamp: Date.now()
        };
    } catch (error) {
        console.error(`❌ Ошибка при запросе прогноза для полива: ${error.message}`);
        throw error;
    }
};

// Функция для проверки и отправки уведомления о поливе
const checkAndNotifyWatering = async (lat, lon) => {
    try {
        const cacheKey = `${Math.round(lat * 100) / 100},${Math.round(lon * 100) / 100}`;
        const forecast = await fetchTomorrowForecast(lat, lon);

        if (!forecast) {
            console.log(`⚠️ Нет прогноза на завтра для ${cacheKey}`);
            return null;
        }

        wateringAlertCache.set(cacheKey, forecast);

        // Логируем результаты
        if (forecast.rain.isRain) {
            console.log(`🌧️ ДОЖДИК: В ${forecast.city} завтра ${forecast.rain.totalRain}мм осадков`);
        } else if (forecast.heat.isHeat) {
            console.log(`☀️ ЖАРА: В ${forecast.city} завтра до ${forecast.heat.maxTemp}°C`);
        } else {
            console.log(`✅ Обычная погода в ${forecast.city}`);
        }

        // Если есть рекомендация - отправляем уведомление
        if (forecast.recommendation.recommendation) {
            console.log(`📤 Отправка рекомендации по поливу: "${forecast.recommendation.emoji}"`);
            await sendWateringNotification(forecast, lat, lon);
        }

        return forecast;
    } catch (error) {
        console.error(`❌ Ошибка при проверке полива: ${error.message}`);
        throw error;
    }
};

// Функция для отправки push уведомления о поливе
const sendWateringNotification = async (forecast, lat, lon) => {
    try {
        const subscriptions = await getSubscriptionsByCoordinates(lat, lon, 2);

        if (subscriptions.length === 0) {
            console.log(`📢 Рекомендация готова, но нет подписчиков`);
            return;
        }

        const rec = forecast.recommendation;
        const notification = {
            title: `${rec.emoji} Рекомендация по поливу`,
            body: rec.recommendation,
            icon: '/garden-icon.png',
            badge: '/garden-badge.png',
            tag: 'watering-alert',
            requireInteraction: false,
            data: {
                type: rec.shouldWater ? 'heat' : 'rain',
                city: forecast.city
            }
        };

        let sent = 0;
        let failed = 0;

        for (const sub of subscriptions) {
            try {
                const parsedSubscription = typeof sub.subscription === 'string'
                    ? JSON.parse(sub.subscription)
                    : sub.subscription;

                await webpush.sendNotification(
                    parsedSubscription,
                    JSON.stringify(notification)
                );
                sent++;
            } catch (error) {
                if (error.statusCode === 410) {
                    console.log(`🗑️ Подписка истекла`);
                }
                failed++;
            }
        }

        console.log(`📤 Рекомендации отправлены: ${sent} успешно, ${failed} ошибок`);
    } catch (error) {
        console.error(`❌ Ошибка при отправке уведомлений: ${error.message}`);
    }
};

// Функция для запуска планировщика
const scheduleWateringCheck = (lat, lon) => {
    const cacheKey = `${Math.round(lat * 100) / 100},${Math.round(lon * 100) / 100}`;

    if (wateringCronTasks.has(cacheKey)) {
        return;
    }

    const timezone = getTimezoneByCoords(lat, lon);

    // Запуск в 12:00 (полдень) каждый день ПО МЕСТНОМУ ВРЕМЕНИ
    const task = cron.schedule(
        '0 12 * * *',
        async () => {
            console.log(`⏰ Проверка рекомендаций по поливу в 12:00 для ${cacheKey}`);
            await checkAndNotifyWatering(lat, lon);
        },
        {
            timezone
        }
    );

    wateringCronTasks.set(cacheKey, task);
    console.log(`📅 Планировщик полива запущен для ${cacheKey} (часовой пояс: ${timezone})`);
};

// Остановка планировщика
const stopWateringSchedule = (lat, lon) => {
    const cacheKey = `${Math.round(lat * 100) / 100},${Math.round(lon * 100) / 100}`;

    if (wateringCronTasks.has(cacheKey)) {
        const task = wateringCronTasks.get(cacheKey);
        task.stop();
        wateringCronTasks.delete(cacheKey);
        console.log(`🛑 Планировщик полива остановлен для ${cacheKey}`);
    }
};

// API endpoint для получения рекомендаций по поливу
exports.getWateringAlert = async (req, res, next) => {
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
        if (wateringAlertCache.has(cacheKey)) {
            const cached = wateringAlertCache.get(cacheKey);
            return res.json({
                ...cached,
                fromCache: true
            });
        }

        // Если кэша нет, запрашиваем
        const forecast = await checkAndNotifyWatering(lat, lon);

        // Запускаем планировщик
        scheduleWateringCheck(lat, lon);

        res.json({
            ...forecast,
            fromCache: false
        });
    } catch (error) {
        next(error);
    }
};

// Очистка и остановка всех планировщиков
exports.stopAllWateringSchedules = () => {
    wateringCronTasks.forEach((task) => {
        task.stop();
    });
    wateringCronTasks.clear();
    console.log('🛑 Все планировщики полива остановлены');
};

exports.stopWateringSchedule = stopWateringSchedule;
exports.scheduleWateringCheck = scheduleWateringCheck;
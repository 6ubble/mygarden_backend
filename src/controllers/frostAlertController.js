const axios = require('axios');
const cron = require('node-cron');
const webpush = require('web-push');
const { getSubscriptionsByCoordinates } = require('../models/pushSubscriptionModel');
const { getTomorrowNightInLocalTimezone, convertToLocalTime, getTimezoneByCoordinates } = require('../utils/timezoneUtils');
require('dotenv').config();

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const FROST_THRESHOLD = 5; // Температура заморозков (0°C)

// Кэш для хранения информации о заморозках
const frostAlertCache = new Map();

// Активные cron задачи для прогнозов
const forecastCronTasks = new Map();

class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
    }
}

// Функция для запроса самого холодного часа завтрашней ночи
const fetchColdestNightHour = async (lat, lon) => {
    try {
        // Вычисляем время завтрашней ночи в ЛОКАЛЬНОМ часовом поясе (по координатам!)
        const nightTimes = getTomorrowNightInLocalTimezone(lat, lon);
        const timezone = getTimezoneByCoordinates(lat, lon);

        // Запрашиваем прогноз
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

        // Фильтруем только часы завтрашней ночи (00:00-06:00 в локальном времени локации)
        const nightForecasts = response.data.list.filter(item => {
            return item.dt >= nightTimes.startUnix && item.dt <= nightTimes.endUnix;
        });

        if (nightForecasts.length === 0) {
            return null;
        }

        // Берем самый холодный час
        const coldestHour = nightForecasts.reduce((coldest, current) => {
            return current.main.temp < coldest.main.temp ? current : coldest;
        });

        // Преобразуем время в локальный часовой пояс локации
        const localTime = convertToLocalTime(coldestHour.dt, lat, lon, 'HH:mm');

        return {
            temp: Math.round(coldestHour.main.temp),
            time: localTime,
            isFrost: coldestHour.main.temp <= FROST_THRESHOLD,
            city: response.data.city.name,
            description: coldestHour.weather[0].description,
            humidity: coldestHour.main.humidity,
            timezone,
            timestamp: Date.now()
        };
    } catch (error) {
        console.error(`❌ Ошибка при запросе прогноза: ${error.message}`);
        throw error;
    }
};

// Функция для проверки заморозков и отправки уведомления
const checkAndNotifyFrost = async (lat, lon) => {
    try {
        const cacheKey = `${Math.round(lat * 100) / 100},${Math.round(lon * 100) / 100}`;
        const forecast = await fetchColdestNightHour(lat, lon);

        if (!forecast) {
            console.log(`⚠️ Нет прогноза на ночь для ${cacheKey}`);
            return null;
        }

        frostAlertCache.set(cacheKey, forecast);

        if (forecast.isFrost) {
            console.log(`🧊 ВНИМАНИЕ: Заморозки в ${forecast.city}! Самый холодный час: ${forecast.time} (${forecast.timezone}), температура: ${forecast.temp}°C`);
            
            // Отправляем push уведомления пользователям
            await sendFrostNotifications(forecast, lat, lon);
        } else {
            console.log(`✅ Заморозков не будет. Минимум ночью: ${forecast.temp}°C в ${forecast.time} (${forecast.timezone})`);
        }

        return forecast;
    } catch (error) {
        console.error(`❌ Ошибка при проверке заморозков: ${error.message}`);
        throw error;
    }
};

// Функция для отправки push уведомлений пользователям
const sendFrostNotifications = async (forecast, lat, lon) => {
    try {
        // Получаем все подписки для координат в радиусе ~2км
        const subscriptions = await getSubscriptionsByCoordinates(lat, lon, 2);

        if (subscriptions.length === 0) {
            console.log(`📢 Уведомление готово, но нет подписчиков для ${forecast.city}`);
            return;
        }

        const notification = {
            title: `🧊 Заморозки в ${forecast.city}!`,
            body: `В ${forecast.time} температура упадет до ${forecast.temp}°C. Защитите растения!`,
            icon: '/garden-icon.png',
            badge: '/garden-badge.png',
            tag: 'frost-alert',
            requireInteraction: true,
            data: {
                city: forecast.city,
                temp: forecast.temp,
                time: forecast.time
            }
        };

        let sent = 0;
        let failed = 0;

        // Отправляем уведомление каждому подписчику
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
                    // Подписка истекла, удаляем
                    console.log(`🗑️ Подписка истекла, удаляем`);
                } else {
                    console.error(`❌ Ошибка отправки для пользователя:`, error.message);
                }
                failed++;
            }
        }

        console.log(`📤 Уведомления отправлены: ${sent} успешно, ${failed} ошибок`);
    } catch (error) {
        console.error(`❌ Ошибка при отправке уведомлений: ${error.message}`);
    }
};

// Функция для запуска планировщика
const scheduleFrostCheck = (lat, lon) => {
    const cacheKey = `${Math.round(lat * 100) / 100},${Math.round(lon * 100) / 100}`;
    
    // Если задача уже существует, не создаём дубликат
    if (forecastCronTasks.has(cacheKey)) {
        return;
    }

    // Запуск в 12:00 (полдень) каждый день
    const cronExpression = '0 12 * * *';
    
    const task = cron.schedule(cronExpression, async () => {
        console.log(`⏰ Проверка заморозков в 12:00 для ${cacheKey}`);
        await checkAndNotifyFrost(lat, lon);
    });

    forecastCronTasks.set(cacheKey, task);
    console.log(`📅 Планировщик заморозков запущен для ${cacheKey}`);
};

// Остановка планировщика
const stopFrostSchedule = (lat, lon) => {
    const cacheKey = `${Math.round(lat * 100) / 100},${Math.round(lon * 100) / 100}`;
    
    if (forecastCronTasks.has(cacheKey)) {
        const task = forecastCronTasks.get(cacheKey);
        task.stop();
        forecastCronTasks.delete(cacheKey);
        console.log(`🛑 Планировщик заморозков остановлен для ${cacheKey}`);
    }
};

// API endpoint для получения информации о заморозках
exports.getFrostAlert = async (req, res, next) => {
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
        if (frostAlertCache.has(cacheKey)) {
            const cached = frostAlertCache.get(cacheKey);
            return res.json({
                ...cached,
                fromCache: true
            });
        }

        // Если кэша нет, запрашиваем
        console.log(`🌐 Первый запрос прогноза для ${cacheKey}`);
        const forecast = await checkAndNotifyFrost(lat, lon);

        // Запускаем планировщик для этих координат
        scheduleFrostCheck(lat, lon);

        res.json({
            ...forecast,
            fromCache: false
        });

    } catch (error) {
        next(error);
    }
};

// Очистка и остановка всех планировщиков
exports.stopAllFrostSchedules = () => {
    forecastCronTasks.forEach((task) => {
        task.stop();
    });
    forecastCronTasks.clear();
    console.log('🛑 Все планировщики заморозков остановлены');
};

exports.stopFrostSchedule = stopFrostSchedule;
exports.scheduleFrostCheck = scheduleFrostCheck;
exports.checkAndNotifyFrost = checkAndNotifyFrost;
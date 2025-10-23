const axios = require('axios');
const cron = require('node-cron');
const moment = require('moment-timezone');
const geoTz = require('geo-tz');
require('dotenv').config();

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

// Кэш в памяти сервера с информацией о времени последнего обновления
const weatherCache = new Map();

// Активные cron задачи (чтобы их можно было остановить)
const cronTasks = new Map();

class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
    }
}

// Функция для запроса погоды у OpenWeatherMap
const fetchFromOpenWeatherMap = async (lat, lon) => {
    try {
        const response = await axios.get(
            `https://api.openweathermap.org/data/2.5/weather`,
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

        return {
            temp: Math.round(response.data.main.temp),
            description: response.data.weather[0].main,
            humidity: response.data.main.humidity,
            windSpeed: Math.round(response.data.wind.speed * 10) / 10,
            icon: response.data.weather[0].icon,
            city: response.data.name,
            timestamp: Date.now()
        };
    } catch (error) {
        if (error.response?.status === 401) {
            throw new AppError('Неверный API ключ OpenWeatherMap', 500);
        } else if (error.response?.status === 404) {
            throw new AppError('Координаты не найдены', 404);
        } else if (error.code === 'ECONNABORTED') {
            throw new AppError('Timeout при запросе к OpenWeatherMap', 504);
        }
        throw error;
    }
};

// Функция для запуска запроса и сохранения в кэш
const updateWeatherCache = async (lat, lon) => {
    try {
        const cacheKey = `${Math.round(lat * 100) / 100},${Math.round(lon * 100) / 100}`;
        const weatherData = await fetchFromOpenWeatherMap(lat, lon);
        
        weatherCache.set(cacheKey, {
            data: weatherData,
            timestamp: Date.now()
        });
        
        console.log(`✅ Погода обновлена для ${cacheKey} в ${new Date().toLocaleTimeString('ru-RU')}`);
    } catch (error) {
        console.error(`❌ Ошибка при обновлении погоды: ${error.message}`);
    }
};

// Функция для планирования обновлений погоды
const scheduleWeatherUpdates = (lat, lon) => {
    const cacheKey = `${Math.round(lat * 100) / 100},${Math.round(lon * 100) / 100}`;
    
    // Если задача уже существует, не создаём дубликат
    if (cronTasks.has(cacheKey)) {
        return;
    }

    // Запуск в 6:00, 12:00, 18:00, 24:00 (00:00) по местному времени
    const cronExpression = '0 6,12,18,0 * * *';
    
    const task = cron.schedule(cronExpression, async () => {
        await updateWeatherCache(lat, lon);
    });

    cronTasks.set(cacheKey, task);
    console.log(`📅 Планировщик запущен для ${cacheKey}`);
    
    // Также делаем первый запрос сразу при подключении
    updateWeatherCache(lat, lon);
};

// Остановка планировщика для координат
const stopWeatherSchedule = (lat, lon) => {
    const cacheKey = `${Math.round(lat * 100) / 100},${Math.round(lon * 100) / 100}`;
    
    if (cronTasks.has(cacheKey)) {
        const task = cronTasks.get(cacheKey);
        task.stop();
        cronTasks.delete(cacheKey);
        console.log(`🛑 Планировщик остановлен для ${cacheKey}`);
    }
};

exports.getWeather = async (req, res, next) => {
    try {
        const { latitude, longitude } = req.query;

        // Валидация координат
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
        if (weatherCache.has(cacheKey)) {
            const cached = weatherCache.get(cacheKey);
            console.log(`📦 Погода из кэша для ${cacheKey}`);
            
            return res.json({
                ...cached.data,
                fromCache: true
            });
        }

        // Если кэша нет, запрашиваем и сохраняем
        console.log(`🌐 Первый запрос погоды для ${cacheKey}`);
        const weatherData = await fetchFromOpenWeatherMap(lat, lon);
        
        weatherCache.set(cacheKey, {
            data: weatherData,
            timestamp: Date.now()
        });

        // Запускаем планировщик для этих координат
        scheduleWeatherUpdates(lat, lon);

        res.json({
            ...weatherData,
            fromCache: false
        });

    } catch (error) {
        next(error);
    }
};

// Очистка и остановка всех планировщиков при выключении сервера
exports.stopAllSchedules = () => {
    cronTasks.forEach((task) => {
        task.stop();
    });
    cronTasks.clear();
    console.log('🛑 Все планировщики остановлены');
};

exports.stopWeatherSchedule = stopWeatherSchedule;
exports.scheduleWeatherUpdates = scheduleWeatherUpdates;
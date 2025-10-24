const axios = require('axios');
const cron = require('node-cron');
const { getTimezoneByCoordinates } = require('../utils/timezoneUtils');
require('dotenv').config();

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const WEATHER_CACHE_TTL = 60 * 60 * 1000;

if (!OPENWEATHER_API_KEY) {
    console.error('OPENWEATHER_API_KEY не установлен в .env');
}

const weatherCache = new Map();
const cronTasks = new Map();

class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
    }
}

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

const updateWeatherCache = async (lat, lon) => {
    try {
        const cacheKey = `${Math.round(lat * 100) / 100},${Math.round(lon * 100) / 100}`;
        const weatherData = await fetchFromOpenWeatherMap(lat, lon);
        
        weatherCache.set(cacheKey, {
            data: weatherData,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error(`Ошибка при обновлении погоды: ${error.message}`);
    }
};

const scheduleWeatherUpdates = (lat, lon) => {
    const cacheKey = `${Math.round(lat * 100) / 100},${Math.round(lon * 100) / 100}`;
    
    if (cronTasks.has(cacheKey)) {
        return;
    }

    const timezone = getTimezoneByCoordinates(lat, lon);
    const cronExpression = '0 6,12,18,0 * * *';
    
    const task = cron.schedule(cronExpression, async () => {
        await updateWeatherCache(lat, lon);
    }, { timezone });

    cronTasks.set(cacheKey, task);
    
    updateWeatherCache(lat, lon);
};

const stopWeatherSchedule = (lat, lon) => {
    const cacheKey = `${Math.round(lat * 100) / 100},${Math.round(lon * 100) / 100}`;
    
    if (cronTasks.has(cacheKey)) {
        const task = cronTasks.get(cacheKey);
        task.stop();
        cronTasks.delete(cacheKey);
    }
};

exports.getWeather = async (req, res, next) => {
    try {
        const lat = req.latitude;
        const lon = req.longitude;

        const cacheKey = `${Math.round(lat * 100) / 100},${Math.round(lon * 100) / 100}`;
        
        if (weatherCache.has(cacheKey)) {
            const cached = weatherCache.get(cacheKey);
            if (Date.now() - cached.timestamp < WEATHER_CACHE_TTL) {
                return res.json({
                    ...cached.data,
                    fromCache: true
                });
            }
        }

        const weatherData = await fetchFromOpenWeatherMap(lat, lon);
        
        weatherCache.set(cacheKey, {
            data: weatherData,
            timestamp: Date.now()
        });

        scheduleWeatherUpdates(lat, lon);

        res.json({
            ...weatherData,
            fromCache: false
        });

    } catch (error) {
        next(error);
    }
};

exports.stopAllSchedules = () => {
    cronTasks.forEach((task) => {
        task.stop();
    });
    cronTasks.clear();
};

exports.stopWeatherSchedule = stopWeatherSchedule;
exports.scheduleWeatherUpdates = scheduleWeatherUpdates;
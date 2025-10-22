const axios = require('axios');
require('dotenv').config();

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 часа

// Кэш в памяти сервера
const weatherCache = new Map();

class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
    }
}

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

        // Создаём ключ кэша на основе координат (округляем до 2 знаков = ~1км точность)
        const cacheKey = `${Math.round(lat * 100) / 100},${Math.round(lon * 100) / 100}`;
        
        // Проверяем кэш
        if (weatherCache.has(cacheKey)) {
            const cached = weatherCache.get(cacheKey);
            
            if (Date.now() - cached.timestamp < CACHE_DURATION) {
                console.log(`📦 Погода из кэша для ${cacheKey}`);
                return res.json({
                    ...cached.data,
                    fromCache: true
                });
            }
        }

        // Запрашиваем у OpenWeatherMap
        console.log(`🌐 Запрос погоды для ${lat}, ${lon}`);
        
        const response = await axios.get(
            `https://api.openweathermap.org/data/2.5/weather`,
            {
                params: {
                    lat,
                    lon,
                    appid: OPENWEATHER_API_KEY,
                    units: 'metric',
                    lang: 'ru'
                }
            }
        );

        const weatherData = {
            temp: Math.round(response.data.main.temp),
            description: response.data.weather[0].main,
            humidity: response.data.main.humidity,
            windSpeed: Math.round(response.data.wind.speed * 10) / 10,
            icon: response.data.weather[0].icon,
            city: response.data.name,
            timestamp: Date.now()
        };

        // Сохраняем в кэш
        weatherCache.set(cacheKey, {
            data: weatherData,
            timestamp: Date.now()
        });

        res.json({
            ...weatherData,
            fromCache: false
        });

    } catch (error) {
        if (error.response?.status === 401) {
            next(new AppError('Неверный API ключ OpenWeatherMap', 500));
        } else if (error.response?.status === 404) {
            next(new AppError('Координаты не найдены', 404));
        } else if (error.message.includes('timeout')) {
            next(new AppError('Timeout при запросе к OpenWeatherMap', 504));
        } else {
            next(error);
        }
    }
};

// Опционально: очистка кэша при перезагрузке сервера
exports.clearWeatherCache = () => {
    weatherCache.clear();
    console.log('🗑️ Кэш погоды очищен');
};
/**
 * Пороги для различных погодных условий
 */
const THRESHOLDS = {
    HEAT_WARNING: 30,        // Очень жарко (выше 30°C)
    HEAT_EXTREME: 35,        // Экстремальная жара (выше 35°C)
    RAIN_THRESHOLD: 0.5,     // Дождь (осадки более 0.5мм)
};

/**
 * Проверить, будет ли очень жарко завтра
 * @param {array} forecasts - Массив прогнозов
 * @returns {object} - { isHeat, maxTemp, description }
 */
const checkHeatWarning = (forecasts) => {
    if (!forecasts || forecasts.length === 0) {
        return { isHeat: false, maxTemp: null, description: null };
    }

    // Берём максимальную температуру за день
    const maxTemp = Math.max(...forecasts.map(f => f.main.temp));
    const hotestForecast = forecasts.find(f => f.main.temp === maxTemp);

    return {
        isHeat: maxTemp >= THRESHOLDS.HEAT_WARNING,
        isExtreme: maxTemp >= THRESHOLDS.HEAT_EXTREME,
        maxTemp: Math.round(maxTemp),
        humidity: hotestForecast?.main.humidity || null,
        description: hotestForecast?.weather[0].description || null
    };
};

/**
 * Проверить, будет ли дождь завтра
 * @param {array} forecasts - Массив прогнозов
 * @returns {object} - { isRain, totalRain, rainHours }
 */
const checkRainWarning = (forecasts) => {
    if (!forecasts || forecasts.length === 0) {
        return { isRain: false, totalRain: 0, rainHours: 0 };
    }

    let totalRain = 0;
    let rainHours = 0;

    forecasts.forEach(forecast => {
        // OpenWeatherMap возвращает rain в мм за 3 часа
        if (forecast.rain) {
            const rainAmount = forecast.rain['3h'] || 0;
            if (rainAmount > 0) {
                totalRain += rainAmount;
                rainHours++;
            }
        }
    });

    return {
        isRain: totalRain >= THRESHOLDS.RAIN_THRESHOLD,
        totalRain: Math.round(totalRain * 10) / 10, // Округляем до 1 знака
        rainHours,
        willRainAll: rainHours >= 6  // Дождь весь день
    };
};

/**
 * Получить рекомендацию по поливу
 * @param {object} heat - Результат checkHeatWarning
 * @param {object} rain - Результат checkRainWarning
 * @returns {object} - { recommendation, shouldWater }
 */
const getWateringRecommendation = (heat, rain) => {
    if (rain.isRain) {
        return {
            recommendation: `💧 Дождик спасёт! Завтра ожидается ${rain.totalRain}мм осадков. Поливать не нужно!`,
            shouldWater: false,
            emoji: '🌧️'
        };
    }

    if (heat.isHeat) {
        const message = heat.isExtreme
            ? `🔥 Экстремальная жара! Завтра до ${heat.maxTemp}°C. Обязательно полейте растения вечером!`
            : `☀️ Очень жарко! Завтра до ${heat.maxTemp}°C. Рекомендуем полить растения вечером.`;
        
        return {
            recommendation: message,
            shouldWater: true,
            emoji: heat.isExtreme ? '🔥' : '☀️'
        };
    }

    return {
        recommendation: null,
        shouldWater: false,
        emoji: null
    };
};

module.exports = {
    THRESHOLDS,
    checkHeatWarning,
    checkRainWarning,
    getWateringRecommendation
};
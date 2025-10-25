const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// Импорт middleware
const errorHandler = require('./middleware/errorHandler');

// CORS конфигурация
const corsOptions = {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

// Основные middleware
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Rate limiters
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Слишком много запросов, попробуйте позже',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => process.env.NODE_ENV === 'development'
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Слишком много попыток входа, попробуйте позже',
    skipSuccessfulRequests: true
});

const weatherLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 30,
    message: 'Слишком много запросов к погоде'
});

app.use(generalLimiter);

// Импорт роутов
const authRoutes = require('./routes/authRoutes');
const weatherRoutes = require('./routes/weatherRoutes');
const pushRoutes = require('./routes/pushRoutes');
const notificationsRoutes = require('./routes/notificationsRoutes');

// Импорт контроллеров для graceful shutdown
const { stopAllSchedules } = require('./controllers/weatherController');
const { stopAllAlertsSchedules } = require('./controllers/weatherAlertsController');

// Регистрация роутов
app.use('/auth', authLimiter, authRoutes);
app.use('/api', weatherLimiter, weatherRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/notifications', notificationsRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: 'Маршрут не найден' });
});

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT;
const server = app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log(`CORS разрешен для: ${process.env.FRONTEND_URL}`);
});

let isShuttingDown = false;

const handleShutdown = () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log('\nПолучен сигнал завершения, закрытие сервера...');
    
    stopAllSchedules();
    stopAllAlertsSchedules();
    
    server.close(() => {
        console.log('Сервер успешно закрыт');
        process.exit(0);
    });

    setTimeout(() => {
        console.error('Сервер не закрылся за 5 секунд, принудительное завершение');
        process.exit(1);
    }, 5000);
};

process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);

process.on('uncaughtException', (error) => {
    console.error('Необработанное исключение:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Необработанный отказ Promise:', reason);
});

module.exports = app;
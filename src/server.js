const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();

app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
}));

app.use(cookieParser());
app.use(express.json());

const authRoutes = require('./routes/authRoutes');
const weatherRoutes = require('./routes/weatherRoutes');
const pushRoutes = require('./routes/pushRoutes');
const { stopAllSchedules } = require('./controllers/weatherController');
const { stopAllFrostSchedules } = require('./controllers/frostAlertController');
const { stopAllWateringSchedules } = require('./controllers/wateringAlertController');

app.use('/auth', authRoutes);
app.use('/api', weatherRoutes);
app.use('/api/push', pushRoutes);

app.use((err, req, res, next) => {
    console.error(err);
    
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Ошибка сервера';
    
    res.status(statusCode).json({ 
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📍 CORS разрешен для: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
});

// Graceful shutdown
let isShuttingDown = false;

const handleShutdown = () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log('\n🛑 Получен сигнал завершения, закрытие сервера...');
    
    stopAllSchedules();
    stopAllFrostSchedules();
    stopAllWateringSchedules();
    
    server.close(() => {
        console.log('✅ Сервер успешно закрыт');
        process.exit(0);
    });

    // Принудительное закрытие через 5 сек если не закрылся
    setTimeout(() => {
        console.error('❌ Сервер не закрылся за 5 секунд, принудительное завершение');
        process.exit(1);
    }, 5000);
};

process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();

// ✅ Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
}));

app.use(cookieParser());
app.use(express.json());

// Импорт маршрутов
const authRoutes = require('./routes/authRoutes');
app.use('/auth', authRoutes);

// === Глобальная обработка ошибок ===
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
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📍 CORS разрешен для: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
});
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

app.use('/auth', authRoutes);
app.use('/api', weatherRoutes);

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
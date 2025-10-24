const mysql = require('mysql2/promise');
require('dotenv').config();

if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_NAME) {
    console.error('Не установлены переменные БД в .env');
    process.exit(1);
}

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
});

pool.on('error', (err) => {
    console.error('Ошибка подключения к БД:', err.message);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        process.exit(1);
    }
});

module.exports = pool;
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { generateToken } = require('../utils/generateToken');

class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
    }
}

const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

const validatePassword = (password) => {
    return password && password.length >= 8;
};

exports.register = async (req, res, next) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password || !name) {
            throw new AppError('Все поля обязательны', 400);
        }

        if (!validateEmail(email)) {
            throw new AppError('Некорректный email', 400);
        }

        if (!validatePassword(password)) {
            throw new AppError('Пароль должен быть минимум 8 символов', 400);
        }

        if (name.length < 2 || name.length > 50) {
            throw new AppError('Имя должно быть от 2 до 50 символов', 400);
        }

        const [existing] = await pool.query(
            'SELECT id FROM users WHERE email = ?', 
            [email.toLowerCase()]
        );
        
        if (existing.length > 0) {
            throw new AppError('Email уже используется', 409);
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.query(
            'INSERT INTO users (email, password, name, created_at) VALUES (?, ?, ?, NOW())',
            [email.toLowerCase(), hashedPassword, name.trim()]
        );

        const token = generateToken({ 
            id: result.insertId, 
            email: email.toLowerCase(), 
            name 
        });
        
        res.cookie('authToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/'
        });

        res.status(201).json({
            user: { 
                id: result.insertId, 
                email: email.toLowerCase(), 
                name 
            }
        });
    } catch (error) {
        next(error);
    }
};

exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            throw new AppError('Email и пароль обязательны', 400);
        }

        const [users] = await pool.query(
            'SELECT * FROM users WHERE email = ?', 
            [email.toLowerCase()]
        );
        
        if (users.length === 0) {
            throw new AppError('Неверный email или пароль', 401);
        }

        const user = users[0];
        const isValid = await bcrypt.compare(password, user.password);
        
        if (!isValid) {
            throw new AppError('Неверный email или пароль', 401);
        }

        const token = generateToken({ 
            id: user.id, 
            email: user.email, 
            name: user.name 
        });

        res.cookie('authToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/'
        });

        res.json({
            user: { 
                id: user.id, 
                email: user.email, 
                name: user.name 
            }
        });
    } catch (error) {
        next(error);
    }
};

exports.getProfile = async (req, res, next) => {
    try {
        const [users] = await pool.query(
            'SELECT id, email, name, created_at FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            throw new AppError('Пользователь не найден', 404);
        }

        res.json({ 
            user: users[0] 
        });
    } catch (error) {
        next(error);
    }
};

exports.logout = async (req, res, next) => {
    try {
        res.clearCookie('authToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/'
        });

        res.json({ message: 'Выход выполнен успешно' });
    } catch (error) {
        next(error);
    }
};
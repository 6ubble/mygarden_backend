const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { generateToken } = require('../utils/generateToken');

// === Регистрация ===
exports.register = async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      throw new AppError('Все поля обязательны', 400);
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      throw new AppError('Email уже используется', 409);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (email, password, name, created_at) VALUES (?, ?, ?, NOW())',
      [email, hashedPassword, name]
    );

    const token = generateToken({ id: result.insertId, email, name });
    
    res.status(201).json({
      token,
      user: { 
        id: result.insertId, 
        email, 
        name 
      }
    });
  } catch (error) {
    next(error);
  }
};

// === Вход ===
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError('Email и пароль обязательны', 400);
    }

    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      throw new AppError('Неверный email или пароль', 401);
    }

    const user = users[0];
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new AppError('Неверный email или пароль', 401);
    }

    const token = generateToken({ id: user.id, email: user.email, name: user.name });

    res.json({
      token,
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

// === Профиль (новый эндпоинт) ===
exports.getProfile = async (req, res, next) => {
  try {
    const [users] = await pool.query(
      'SELECT id, email, name, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (users.length === 0) {
      throw new AppError('Пользователь не найден', 404);
    }

    res.json(users[0]);
  } catch (error) {
    next(error);
  }
};

// === Выход ===
exports.logout = async (req, res, next) => {
  try {
    res.json({ message: 'Выход выполнен успешно' });
  } catch (error) {
    next(error);
  }
};

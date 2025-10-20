const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { generateToken } = require('../utils/generateToken');

// === Регистрация ===
exports.register = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name)
      return res.status(400).json({ message: 'Все поля обязательны' });

    if (password.length < 6)
      return res.status(400).json({ message: 'Минимум 6 символов' });

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0)
      return res.status(409).json({ message: 'Email уже используется' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (email, password, name, created_at) VALUES (?, ?, ?, NOW())',
      [email, hashedPassword, name]
    );

    const token = generateToken({ id: result.insertId, email, name });
    res.status(201).json({
      message: 'Пользователь зарегистрирован',
      token,
      user: { id: result.insertId, email, name }
    });
  } catch (error) {
    console.error('Ошибка регистрации:', error);
    res.status(500).json({ message: 'Ошибка сервера при регистрации' });
  }
};

// === Вход ===
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Email и пароль обязательны' });

    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0)
      return res.status(401).json({ message: 'Неверный email или пароль' });

    const user = users[0];
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid)
      return res.status(401).json({ message: 'Неверный email или пароль' });

    const token = generateToken({ id: user.id, email: user.email, name: user.name });
    res.json({
      message: 'Успешный вход',
      token,
      user: { id: user.id, email: user.email, name: user.name }
    });
  } catch (error) {
    console.error('Ошибка входа:', error);
    res.status(500).json({ message: 'Ошибка сервера при входе' });
  }
};

// === Профиль ===
exports.getProfile = async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, email, name, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (users.length === 0)
      return res.status(404).json({ message: 'Пользователь не найден' });

    res.json({ user: users[0] });
  } catch (error) {
    console.error('Ошибка профиля:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

// === Проверка токена ===
exports.verify = (req, res) => {
  res.json({ valid: true, user: req.user });
};
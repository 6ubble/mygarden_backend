const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error('JWT_SECRET не установлен в .env');
    process.exit(1);
}

const authenticateToken = (req, res, next) => {
    const token = req.cookies?.authToken;

    if (!token) {
        return res.status(401).json({ message: 'Токен не предоставлен' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ message: 'Токен истек' });
            }
            return res.status(403).json({ message: 'Недействительный токен' });
        }
        req.user = user;
        next();
    });
};

module.exports = { authenticateToken };
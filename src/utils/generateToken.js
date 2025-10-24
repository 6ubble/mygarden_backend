const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error('JWT_SECRET должен быть минимум 32 символа');
    process.exit(1);
}

function generateToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { 
        expiresIn: '7d',
        algorithm: 'HS256'
    });
}

module.exports = { generateToken };
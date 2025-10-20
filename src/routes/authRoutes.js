const express = require('express');
const router = express.Router();
const { register, login, getProfile, verify } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.get('/profile', authenticateToken, getProfile);
router.get('/verify', authenticateToken, verify);

module.exports = router;

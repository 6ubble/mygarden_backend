const express = require('express');
const router = express.Router();
const { getWeather } = require('../controllers/weatherController');
const { getAllAlerts } = require('../controllers/weatherAlertsController');

// GET /weather?latitude=55.75&longitude=37.62
router.get('/weather', getWeather);

// GET /alerts?latitude=55.75&longitude=37.62
// Возвращает заморозки, жару, дождь и рекомендации по поливу в одном запросе!
router.get('/alerts', getAllAlerts);

module.exports = router;
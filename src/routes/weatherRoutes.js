const express = require('express');
const router = express.Router();
const { getWeather } = require('../controllers/weatherController');
const weatherAlertsController = require('../controllers/weatherAlertsController');

// GET /weather?latitude=55.75&longitude=37.62
router.get('/weather', getWeather);

// GET /alerts?latitude=55.75&longitude=37.62
router.get('/alerts', weatherAlertsController.getAllAlerts);

// POST /alerts/test (тестовый запрос)
router.post('/alerts/test', weatherAlertsController.testAlert);

module.exports = router;
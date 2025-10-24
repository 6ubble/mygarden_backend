const express = require('express');
const router = express.Router();
const { validateCoordinates } = require('../middleware/validation');
const { getWeather } = require('../controllers/weatherController');
const weatherAlertsController = require('../controllers/weatherAlertsController');

router.get('/weather/', validateCoordinates, getWeather);
router.get('/alerts', validateCoordinates, weatherAlertsController.getAllAlerts);
router.post('/alerts/test', validateCoordinates, weatherAlertsController.testAlert);

module.exports = router;
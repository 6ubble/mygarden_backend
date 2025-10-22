const express = require('express');
const router = express.Router();
const { getWeather } = require('../controllers/weatherController');
const { getFrostAlert } = require('../controllers/frostAlertController');
const { getWateringAlert } = require('../controllers/wateringAlertController');

// GET /weather?latitude=55.75&longitude=37.62
router.get('/weather', getWeather);

// GET /frost-alert?latitude=55.75&longitude=37.62
router.get('/frost-alert', getFrostAlert);

// GET /watering-alert?latitude=55.75&longitude=37.62
router.get('/watering-alert', getWateringAlert);

module.exports = router;
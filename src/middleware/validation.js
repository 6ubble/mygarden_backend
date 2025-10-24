class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.statusCode = 400;
    }
}

const validateCoordinates = (req, res, next) => {
    const coords = req.query || req.body;
    const { latitude, longitude } = coords;

    if (!latitude || !longitude) {
        return res.status(400).json({ message: 'Координаты обязательны' });
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({ message: 'Координаты должны быть числами' });
    }

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return res.status(400).json({ message: 'Координаты выходят за допустимые границы' });
    }

    req.latitude = lat;
    req.longitude = lon;
    next();
};

const validatePagination = (req, res, next) => {
    let limit = parseInt(req.query.limit) || 50;
    let offset = parseInt(req.query.offset) || 0;

    if (isNaN(limit) || isNaN(offset)) {
        return res.status(400).json({ message: 'Limit и offset должны быть числами' });
    }

    limit = Math.min(Math.max(limit, 1), 100);
    offset = Math.max(offset, 0);

    req.limit = limit;
    req.offset = offset;
    next();
};

const validateNotEmptyBody = (req, res, next) => {
    if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ message: 'Тело запроса не может быть пустым' });
    }
    next();
};

module.exports = {
    validateCoordinates,
    validatePagination,
    validateNotEmptyBody,
    ValidationError
};
const errorHandler = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Ошибка сервера';
    
    console.error(`[${statusCode}] ${message}`, {
        path: req.path,
        method: req.method,
        ip: req.ip,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
    
    res.status(statusCode).json({ 
        message,
        status: statusCode,
        ...(process.env.NODE_ENV === 'development' && { error: err.message })
    });
};

module.exports = errorHandler;
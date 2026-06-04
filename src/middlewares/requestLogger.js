import logger from '../utils/logger.js';

export default function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    logger.info({
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${Date.now() - start}ms`,
    });
  });

  next();
}

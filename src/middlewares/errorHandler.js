import logger from '../utils/logger.js';

export function notFoundHandler(req, res, _next) {
  res.status(404).json({
    success: false,
    error: `Cannot ${req.method} ${req.originalUrl}`,
  });
}

export function errorHandler(err, _req, res, _next) {
  logger.error({ err }, 'Unhandled error');

  const status = err.status || 500;
  const message =
    process.env.NODE_ENV === 'production' && status === 500
      ? 'Internal Server Error'
      : err.message;

  res.status(status).json({
    success: false,
    error: message,
  });
}

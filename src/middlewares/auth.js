import jwt from 'jsonwebtoken';
import config from '../config/index.js';

export default function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing or invalid token' });
  }

  const token = header.slice(7);

  try {
    req.user = jwt.verify(token, config.jwt.secret);
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Token expired or invalid' });
  }
}

export function optionalAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = header.slice(7);

  try {
    req.user = jwt.verify(token, config.jwt.secret);
  } catch {
    req.user = null;
  }

  next();
}

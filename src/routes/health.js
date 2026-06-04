import { Router } from 'express';
import pool from '../libs/db.js';
import redis from '../libs/redis.js';

const router = Router();

router.get('/health', async (_req, res) => {
  const result = {
    status: 'ok',
    mysql: 'connected',
    redis: 'connected',
    uptime: process.uptime(),
  };

  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
  } catch {
    result.status = 'error';
    result.mysql = 'disconnected';
  }

  try {
    await redis.ping();
  } catch {
    result.status = 'error';
    result.redis = 'disconnected';
  }

  const statusCode = result.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(result);
});

export default router;

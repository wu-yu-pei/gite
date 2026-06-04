import Redis from 'ioredis';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  retryStrategy(times) {
    if (times > 3) return null;
    return Math.min(times * 200, 2000);
  },
});

export async function testConnection() {
  try {
    await redis.ping();
    logger.info('Redis connected');
  } catch (err) {
    logger.fatal({ err }, 'Redis connection failed');
    process.exit(1);
  }
}

export default redis;

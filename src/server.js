import config from './config/index.js';
import logger from './utils/logger.js';
import { testConnection as testMySQL } from './libs/db.js';
import { testConnection as testRedis } from './libs/redis.js';
import { migrate } from './db/migrate.js';
import app from './app.js';

async function start() {
  await testMySQL();
  await testRedis();
  await migrate();

  app.listen(config.port, () => {
    logger.info(`Server running on port ${config.port} [${config.nodeEnv}]`);
  });
}

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});

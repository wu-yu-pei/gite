import cron from 'node-cron';
import { query } from '../libs/db.js';
import { executeDraw } from '../services/draw.js';
import logger from '../utils/logger.js';

export function startLotteryCron() {
  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      const rows = await query(
        `SELECT id FROM lotteries
         WHERE status = 'active' AND draw_mode = 'scheduled' AND draw_at <= NOW()`,
        []
      );

      for (const row of rows) {
        try {
          await executeDraw(row.id);
        } catch (err) {
          logger.error({ err, lotteryId: row.id }, 'Scheduled draw failed');
        }
      }
    } catch (err) {
      logger.error({ err }, 'Lottery cron scan failed');
    }
  });

  logger.info('Lottery cron started (every minute)');
}

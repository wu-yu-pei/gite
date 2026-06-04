import cron from 'node-cron';
import { query } from '../libs/db.js';
import { executeDraw } from '../services/draw.js';
import logger from '../utils/logger.js';

export function startLotteryCron() {
  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      logger.info('[Cron] Scanning for lotteries to draw...');

      const rows = await query(
        `SELECT id, title, draw_at FROM lotteries
         WHERE status = 'active' AND draw_mode = 'scheduled' AND draw_at <= NOW()`,
        []
      );

      if (rows.length === 0) {
        logger.info('[Cron] No lotteries pending draw');
        return;
      }

      logger.info({ count: rows.length, lotteryIds: rows.map((r) => r.id) }, '[Cron] Found lotteries to draw');

      for (const row of rows) {
        logger.info({ lotteryId: row.id, title: row.title, drawAt: row.draw_at }, '[Cron] Starting draw for lottery');
        try {
          const result = await executeDraw(row.id);
          if (result) {
            logger.info({ lotteryId: row.id, title: row.title }, '[Cron] Draw succeeded');
          } else {
            logger.warn({ lotteryId: row.id }, '[Cron] Draw skipped (already drawn or lock not acquired)');
          }
        } catch (err) {
          logger.error({ err, lotteryId: row.id, title: row.title }, '[Cron] Draw failed with error');
        }
      }
    } catch (err) {
      logger.error({ err }, '[Cron] Lottery scan failed');
    }
  });

  logger.info('Lottery cron started (every minute)');
}

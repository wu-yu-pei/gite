import pool from '../libs/db.js';
import redis from '../libs/redis.js';
import logger from '../utils/logger.js';

const LOCK_TTL = 30; // seconds
const RELEASE_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

async function acquireLock(lotteryId) {
  const key = `lottery:draw:${lotteryId}`;
  const value = `${process.pid}:${Date.now()}`;
  const result = await redis.set(key, value, 'EX', LOCK_TTL, 'NX');
  return result === 'OK' ? value : null;
}

async function releaseLock(lotteryId, lockValue) {
  const key = `lottery:draw:${lotteryId}`;
  await redis.eval(RELEASE_SCRIPT, 1, key, lockValue);
}

export async function executeDraw(lotteryId) {
  logger.info({ lotteryId }, '[Draw] Acquiring lock...');
  const lockValue = await acquireLock(lotteryId);
  if (!lockValue) {
    logger.warn({ lotteryId }, '[Draw] Lock not acquired, skipping');
    return false;
  }
  logger.info({ lotteryId }, '[Draw] Lock acquired');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    logger.info({ lotteryId }, '[Draw] Transaction started');

    // Double-check status under transaction
    const [rows] = await conn.execute(
      'SELECT id, winner_count FROM lotteries WHERE id = ? AND status = ? FOR UPDATE',
      [lotteryId, 'active']
    );

    if (rows.length === 0) {
      logger.warn({ lotteryId }, '[Draw] Lottery not active, aborting');
      await conn.rollback();
      return false;
    }

    const lottery = rows[0];
    logger.info({ lotteryId, winnerCount: lottery.winner_count }, '[Draw] Lottery confirmed active, picking winners...');

    // Count total participants
    const [allParticipants] = await conn.execute(
      'SELECT COUNT(*) AS total FROM lottery_participants WHERE lottery_id = ?',
      [lotteryId]
    );
    const totalParticipants = allParticipants[0].total;
    logger.info({ lotteryId, totalParticipants }, '[Draw] Total participants');

    // Pick random winners (LIMIT does not support prepared statement placeholders)
    const winnerLimit = Number(lottery.winner_count);
    const [participants] = await conn.execute(
      `SELECT id, user_id FROM lottery_participants WHERE lottery_id = ? ORDER BY RAND() LIMIT ${winnerLimit}`,
      [lotteryId]
    );

    logger.info(
      { lotteryId, pickedCount: participants.length, winnerUserIds: participants.map((p) => p.user_id) },
      '[Draw] Winners picked'
    );

    if (participants.length > 0) {
      const winnerIds = participants.map((p) => p.id);
      await conn.execute(
        `UPDATE lottery_participants SET is_winner = 1 WHERE id IN (${winnerIds.map(() => '?').join(',')})`,
        winnerIds
      );
      logger.info({ lotteryId, winnerIds }, '[Draw] Winner records updated');
    }

    // Mark lottery as drawn
    await conn.execute(
      'UPDATE lotteries SET status = ?, drawn_at = NOW() WHERE id = ?',
      ['drawn', lotteryId]
    );

    await conn.commit();
    logger.info(
      { lotteryId, totalParticipants, winnersSelected: participants.length, expectedWinners: lottery.winner_count },
      '[Draw] Completed successfully'
    );
    return true;
  } catch (err) {
    await conn.rollback();
    logger.error({ err, lotteryId }, '[Draw] Failed, transaction rolled back');
    throw err;
  } finally {
    conn.release();
    await releaseLock(lotteryId, lockValue);
    logger.info({ lotteryId }, '[Draw] Lock released, connection returned');
  }
}

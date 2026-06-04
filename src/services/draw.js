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
  const lockValue = await acquireLock(lotteryId);
  if (!lockValue) {
    logger.warn({ lotteryId }, 'Draw lock not acquired, skipping');
    return false;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.execute(
      'SELECT id, winner_count FROM lotteries WHERE id = ? AND status = ? FOR UPDATE',
      [lotteryId, 'active']
    );

    if (rows.length === 0) {
      await conn.rollback();
      return false;
    }

    const lottery = rows[0];

    const [participants] = await conn.execute(
      'SELECT id, user_id FROM lottery_participants WHERE lottery_id = ? ORDER BY RAND() LIMIT ?',
      [lotteryId, lottery.winner_count]
    );

    if (participants.length > 0) {
      const winnerIds = participants.map((p) => p.id);
      await conn.execute(
        `UPDATE lottery_participants SET is_winner = 1 WHERE id IN (${winnerIds.map(() => '?').join(',')})`,
        winnerIds
      );
    }

    await conn.execute(
      'UPDATE lotteries SET status = ?, drawn_at = NOW() WHERE id = ?',
      ['drawn', lotteryId]
    );

    await conn.commit();
    logger.info({ lotteryId, winnerCount: participants.length }, 'Draw completed');
    return true;
  } catch (err) {
    await conn.rollback();
    logger.error({ err, lotteryId }, 'Draw failed');
    throw err;
  } finally {
    conn.release();
    await releaseLock(lotteryId, lockValue);
  }
}

import pool from '../libs/db.js';
import { query } from '../libs/db.js';
import logger from '../utils/logger.js';

/**
 * Execute a single instant draw for a user.
 * Returns the won prize row (with id, name, type, image_url).
 *
 * @param {number} activityId
 * @param {number} userId
 * @param {string} source - 'base' | 'checkin' | 'share'
 * @returns {Promise<{id: number, name: string, type: string, imageUrl: string|null}>}
 */
export async function executeSpinDraw(activityId, userId, source) {
  const prizes = await query(
    'SELECT id, name, type, image_url, probability, stock FROM spin_prizes WHERE activity_id = ?',
    [activityId]
  );

  const noneItem = prizes.find((p) => p.type === 'none');
  if (!noneItem) {
    throw new Error(`Activity ${activityId} has no "none" prize configured`);
  }

  // Build effective probability list: exhausted stock prizes redirect to "none"
  let bonusProbability = 0;
  const eligible = [];

  for (const p of prizes) {
    if (p.type === 'none') continue;
    if (p.stock !== null && p.stock <= 0) {
      bonusProbability += Number(p.probability);
    } else {
      eligible.push({ ...p, probability: Number(p.probability) });
    }
  }

  eligible.push({
    ...noneItem,
    probability: Number(noneItem.probability) + bonusProbability,
  });

  // Weighted random pick
  const rand = Math.random();
  let cumulative = 0;
  let picked = eligible[eligible.length - 1]; // fallback to last (none)

  for (const item of eligible) {
    cumulative += item.probability;
    if (rand < cumulative) {
      picked = item;
      break;
    }
  }

  // If picked prize has stock, try to deduct atomically
  if (picked.type !== 'none' && picked.stock !== null) {
    const [result] = await pool.execute(
      'UPDATE spin_prizes SET stock = stock - 1 WHERE id = ? AND stock > 0',
      [picked.id]
    );
    if (result.affectedRows === 0) {
      logger.info({ activityId, prizeId: picked.id }, '[SpinDraw] Stock race, falling back to none');
      picked = noneItem;
    }
  }

  // Record the draw
  await query(
    'INSERT INTO spin_records (activity_id, user_id, prize_id, source) VALUES (?, ?, ?, ?)',
    [activityId, userId, picked.id, source]
  );

  logger.info(
    { activityId, userId, prizeId: picked.id, prizeName: picked.name, source },
    '[SpinDraw] Draw completed'
  );

  return { id: picked.id, name: picked.name, type: picked.type, imageUrl: picked.image_url };
}

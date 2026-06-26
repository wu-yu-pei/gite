import { query } from '../libs/db.js';
import pool from '../libs/db.js';
import logger from '../utils/logger.js';

/**
 * 获取用户碎片余额。
 * @param {number} userId
 * @returns {Promise<number>} 碎片数量
 */
export async function getFragmentBalance(userId) {
  const [row] = await query(
    `SELECT quantity FROM user_fragments WHERE user_id = ?`,
    [userId]
  );
  return row ? row.quantity : 0;
}

/**
 * 获取所有启用的兑换奖励列表（用于前端展示）。
 */
export async function getActiveExchangeRewards() {
  return query(
    `SELECT id, name, description, image_url, type, draws_quantity, min_draws, fragment_cost, stock, sort_order
     FROM exchange_rewards
     WHERE is_active = 1
     ORDER BY sort_order`
  );
}

/**
 * 执行碎片兑换。使用事务保证原子性。
 * @param {number} userId
 * @param {number} rewardId - 要兑换的奖励 ID
 */
export async function executeExchange(userId, rewardId) {
  const [reward] = await query(
    `SELECT * FROM exchange_rewards WHERE id = ? AND is_active = 1`,
    [rewardId]
  );

  if (!reward) {
    return { success: false, error: '兑换奖励不存在或已下架' };
  }

  if (reward.stock !== null && reward.stock <= 0) {
    return { success: false, error: '该奖励已兑完' };
  }

  // 检查抽奖次数门槛
  if (reward.min_draws > 0) {
    const [totalRow] = await query(
      `SELECT COUNT(*) AS cnt FROM draw_records WHERE user_id = ?`,
      [userId]
    );
    if (totalRow.cnt < reward.min_draws) {
      return { success: false, error: `需要累计抽奖${reward.min_draws}次才可兑换，当前${totalRow.cnt}次` };
    }
  }

  const balance = await getFragmentBalance(userId);
  if (balance < reward.fragment_cost) {
    return { success: false, error: `碎片不足，需要${reward.fragment_cost}个碎片，当前拥有${balance}个` };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [deductResult] = await conn.execute(
      `UPDATE user_fragments SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND quantity >= ?`,
      [reward.fragment_cost, userId, reward.fragment_cost]
    );

    if (deductResult.affectedRows === 0) {
      await conn.rollback();
      return { success: false, error: '碎片不足或余额异常' };
    }

    if (reward.stock !== null) {
      const [stockResult] = await conn.execute(
        `UPDATE exchange_rewards SET stock = stock - 1 WHERE id = ? AND stock > 0`,
        [rewardId]
      );
      if (stockResult.affectedRows === 0) {
        await conn.rollback();
        return { success: false, error: '该奖励已兑完' };
      }
    }

    await conn.execute(
      `INSERT INTO exchange_records (user_id, reward_id, fragment_cost) VALUES (?, ?, ?)`,
      [userId, rewardId, reward.fragment_cost]
    );

    // 如果兑换的是抽奖次数，增加用户今日抽奖机会
    if (reward.type === 'draws' && reward.draws_quantity > 0) {
      const today = new Date().toISOString().slice(0, 10);
      await conn.execute(
        `INSERT INTO user_daily_state (user_id, date, exchange_draws_earned)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE exchange_draws_earned = exchange_draws_earned + ?`,
        [userId, today, reward.draws_quantity, reward.draws_quantity]
      );
    }

    await conn.commit();

    const newBalance = balance - reward.fragment_cost;

    return {
      success: true,
      data: {
        reward: {
          id: reward.id,
          name: reward.name,
          description: reward.description,
          imageUrl: reward.image_url,
          type: reward.type,
          drawsQuantity: reward.type === 'draws' ? reward.draws_quantity : undefined,
          fragmentCost: reward.fragment_cost,
        },
        fragmentBalance: newBalance,
      },
    };
  } catch (err) {
    await conn.rollback();
    logger.error({ err }, '兑换事务执行失败');
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * 获取用户兑换历史记录，最近 50 条。
 * @param {number} userId
 */
export async function getExchangeRecords(userId) {
  return query(
    `SELECT er.id, er.fragment_cost, er.created_at,
            ew.name AS reward_name, ew.description AS reward_description,
            ew.image_url AS reward_image_url, ew.type AS reward_type, ew.draws_quantity AS reward_draws_quantity
     FROM exchange_records er
     JOIN exchange_rewards ew ON ew.id = er.reward_id
     WHERE er.user_id = ?
     ORDER BY er.created_at DESC
     LIMIT 50`,
    [userId]
  );
}

import { query } from '../libs/db.js';
import pool from '../libs/db.js';
import logger from '../utils/logger.js';

/**
 * 为用户增加碎片数量（在已有事务连接上执行）。
 * @param {import('mysql2/promise').PoolConnection} conn - 事务连接
 * @param {number} userId
 * @param {number} quantity - 增加的碎片数量
 */
async function addFragments(conn, userId, quantity) {
  await conn.execute(
    `INSERT INTO user_fragments (user_id, quantity)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP`,
    [userId, quantity, quantity]
  );
}

/**
 * 获取或创建用户今日的每日状态记录。
 * @param {number} userId
 * @returns {Promise<object>} user_daily_state 行
 */
export async function getOrCreateDailyState(userId) {
  const today = new Date().toISOString().slice(0, 10);

  await query(
    `INSERT IGNORE INTO user_daily_state (user_id, date) VALUES (?, ?)`,
    [userId, today]
  );

  const [state] = await query(
    `SELECT * FROM user_daily_state WHERE user_id = ? AND date = ?`,
    [userId, today]
  );

  return state;
}

/**
 * 计算用户今日剩余抽奖次数。
 */
export function getRemainingDraws(state) {
  const baseFree = 1;
  const totalEarned = baseFree + state.ad_draws_earned + state.invite_draws_earned;
  const used = state.free_draws_used;
  return Math.max(0, totalEarned - used);
}

/**
 * 获取所有启用且有库存的奖品（用于抽奖选择）。
 */
export async function getActivePrizes() {
  return query(
    `SELECT * FROM prizes WHERE is_active = 1 AND (stock IS NULL OR stock > 0) ORDER BY sort_order`
  );
}

/**
 * 获取所有启用的奖品（包括已无库存的，用于前端展示）。
 */
export async function getAllDisplayPrizes() {
  return query(`SELECT id, name, description, image_url, type, sort_order FROM prizes WHERE is_active = 1 ORDER BY sort_order`);
}

/**
 * 获取保底配置。
 */
export async function getPityConfig() {
  const [config] = await query(`SELECT * FROM pity_config LIMIT 1`);
  return config || null;
}

/**
 * 加权随机选择奖品。
 * @param {Array} prizes - 每个奖品必须包含 weight 属性
 * @returns {object} 被选中的奖品
 */
export function weightedRandom(prizes) {
  const totalWeight = prizes.reduce((sum, p) => sum + p.weight, 0);
  let random = Math.random() * totalWeight;

  for (const prize of prizes) {
    random -= prize.weight;
    if (random <= 0) {
      return prize;
    }
  }

  return prizes[prizes.length - 1];
}

/**
 * 执行一次抽奖。返回中奖的奖品。
 * 使用事务保证原子性。
 */
export async function executeDraw(userId) {
  const state = await getOrCreateDailyState(userId);
  const remaining = getRemainingDraws(state);

  if (remaining <= 0) {
    return { success: false, error: '今日抽奖次数已用完' };
  }

  const availablePrizes = await getActivePrizes();
  if (availablePrizes.length === 0) {
    return { success: false, error: '暂无可用奖品' };
  }

  const pityConfig = await getPityConfig();
  let selectedPrize;
  let isPity = false;

  // 检查保底系统
  if (pityConfig && state.consecutive_losses >= pityConfig.pity_threshold - 1) {
    const pityPrize = availablePrizes.find(p => p.id === pityConfig.pity_prize_id);
    if (pityPrize) {
      selectedPrize = pityPrize;
      isPity = true;
    }
  }

  // 保底未触发则使用加权随机
  if (!selectedPrize) {
    selectedPrize = weightedRandom(availablePrizes);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 如果奖品有库存限制，扣减库存
    if (selectedPrize.stock !== null) {
      const [result] = await conn.execute(
        `UPDATE prizes SET stock = stock - 1 WHERE id = ? AND stock > 0`,
        [selectedPrize.id]
      );
      if (result.affectedRows === 0) {
        await conn.rollback();
        const thanksPrize = availablePrizes.find(p => p.type === 'thanks');
        if (thanksPrize) {
          selectedPrize = thanksPrize;
          isPity = false;
        } else {
          conn.release();
          return { success: false, error: '奖品已领完' };
        }
        await conn.beginTransaction();
      }
    }

    // 记录本次抽奖
    await conn.execute(
      `INSERT INTO draw_records (user_id, prize_id, is_pity) VALUES (?, ?, ?)`,
      [userId, selectedPrize.id, isPity ? 1 : 0]
    );

    // 更新每日状态
    const isRealWin = selectedPrize.type !== 'thanks' && selectedPrize.type !== 'fragment';
    const newConsecutiveLosses = isRealWin ? 0 : state.consecutive_losses + 1;

    await conn.execute(
      `UPDATE user_daily_state
       SET free_draws_used = free_draws_used + 1,
           total_draws = total_draws + 1,
           consecutive_losses = ?
       WHERE user_id = ? AND date = ?`,
      [newConsecutiveLosses, userId, new Date().toISOString().slice(0, 10)]
    );

    // 如果中了碎片奖品，增加用户碎片数量
    if (selectedPrize.type === 'fragment') {
      await addFragments(conn, userId, selectedPrize.fragment_quantity);
    }

    await conn.commit();

    return {
      success: true,
      data: {
        prize: {
          id: selectedPrize.id,
          name: selectedPrize.name,
          description: selectedPrize.description,
          imageUrl: selectedPrize.image_url,
          type: selectedPrize.type,
          fragmentQuantity: selectedPrize.type === 'fragment' ? selectedPrize.fragment_quantity : undefined,
        },
        isPity,
      },
    };
  } catch (err) {
    await conn.rollback();
    logger.error({ err }, '抽奖事务执行失败');
    throw err;
  } finally {
    conn.release();
  }
}

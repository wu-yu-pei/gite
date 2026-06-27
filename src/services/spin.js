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
  const today = new Date().toLocaleDateString('sv-SE');

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
  const totalEarned = baseFree + state.ad_draws_earned + state.invite_draws_earned + (state.exchange_draws_earned || 0);
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
  return query(`SELECT id, name, description, image_url, type, fragment_quantity, sort_order FROM prizes WHERE is_active = 1 ORDER BY sort_order`);
}

/**
 * 获取保底配置。
 */
export async function getPityConfig() {
  const [config] = await query(`SELECT * FROM pity_config LIMIT 1`);
  return config || null;
}

/**
 * 获取碎片动态权重配置。
 */
export async function getFragmentWeightConfig() {
  const [config] = await query(`SELECT * FROM fragment_weight_config LIMIT 1`);
  return config || null;
}

/**
 * 根据用户累计抽奖次数动态调整碎片奖品权重。
 * 初期大碎片概率高（加成最大），随抽奖次数增加加成衰减，小碎片概率自然上升。
 *
 * @param {Array} prizes - 可用奖品列表
 * @param {number} totalDraws - 用户累计抽奖次数
 * @param {object} weightConfig - 动态权重配置 { is_enabled, boost_max, half_life }
 * @returns {Array} 调整权重后的奖品列表（新数组，不修改原对象）
 */
export function adjustFragmentWeights(prizes, totalDraws, weightConfig) {
  if (!weightConfig || !weightConfig.is_enabled) return prizes;

  const fragments = prizes.filter(p => p.type === 'fragment');
  if (fragments.length === 0) return prizes;

  const maxQ = Math.max(...fragments.map(p => p.fragment_quantity));
  const boostMax = Number(weightConfig.boost_max);
  const halfLife = weightConfig.half_life;

  // decay: 1.0 → 0.0，控制加成衰减速度
  const decay = Math.pow(0.5, totalDraws / halfLife);

  return prizes.map(p => {
    if (p.type !== 'fragment') return p;

    // ratio: 碎片大小比例，0（最小）~ 1（最大）
    const ratio = p.fragment_quantity / maxQ;

    // 大碎片 (ratio≈1): boost ≈ 1 + (boostMax-1) * decay ≈ boostMax → 1x
    // 小碎片 (ratio≈0): boost ≈ 1（始终不变）
    const boost = 1 + (boostMax - 1) * decay * ratio;

    return { ...p, weight: Math.max(1, Math.round(p.weight * boost)) };
  });
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

  // 保底未触发则使用加权随机（碎片权重随抽奖次数动态调整）
  if (!selectedPrize) {
    const [weightConfig, [totalRow]] = await Promise.all([
      getFragmentWeightConfig(),
      query(`SELECT COUNT(*) AS cnt FROM draw_records WHERE user_id = ?`, [userId]),
    ]);
    const adjustedPrizes = adjustFragmentWeights(availablePrizes, totalRow.cnt, weightConfig);

    // 输出当前用户抽奖概率到日志
    const totalWeight = adjustedPrizes.reduce((sum, p) => sum + p.weight, 0);
    logger.info({
      userId,
      totalDraws: totalRow.cnt,
      probabilities: adjustedPrizes.map(p => ({
        name: p.name,
        type: p.type,
        weight: p.weight,
        probability: `${(p.weight / totalWeight * 100).toFixed(2)}%`,
      })),
    }, '抽奖概率分布');

    selectedPrize = weightedRandom(adjustedPrizes);
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
      [newConsecutiveLosses, userId, new Date().toLocaleDateString('sv-SE')]
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

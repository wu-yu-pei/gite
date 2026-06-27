import { Router } from 'express';
import auth, { optionalAuth } from '../middlewares/auth.js';
import {
  getFragmentBalance,
  getActiveExchangeRewardsByCategory,
  executeExchange,
  getExchangeRecords,
} from '../services/exchange.js';

const router = Router();

/**
 * GET /api/exchange/home
 * 兑换模块首页：碎片余额 + 可兑换奖励列表
 */
router.get('/api/exchange/home', optionalAuth, async (req, res) => {
  const userId = req.user?.userId;

  const [balance, categories] = await Promise.all([
    userId ? getFragmentBalance(userId) : Promise.resolve(0),
    getActiveExchangeRewardsByCategory(),
  ]);

  res.json({
    success: true,
    data: {
      fragmentBalance: balance,
      categories: categories.map(c => ({
        id: c.id,
        name: c.name,
        rewards: c.rewards.map(r => ({
          id: r.id,
          name: r.name,
          description: r.description,
          imageUrl: r.image_url,
          type: r.type,
          drawsQuantity: r.type === 'draws' ? r.draws_quantity : undefined,
          minDraws: r.min_draws,
          fragmentCost: r.fragment_cost,
          stock: r.stock,
          sortOrder: r.sort_order,
        })),
      })),
    },
  });
});

/**
 * POST /api/exchange/redeem
 * 执行碎片兑换
 */
router.post('/api/exchange/redeem', auth, async (req, res) => {
  const { rewardId } = req.body;

  if (!rewardId) {
    return res.status(400).json({ success: false, error: '缺少 rewardId 参数' });
  }

  const result = await executeExchange(req.user.userId, Number(rewardId));

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
});

/**
 * GET /api/exchange/records
 * 用户兑换历史记录
 */
router.get('/api/exchange/records', auth, async (req, res) => {
  const records = await getExchangeRecords(req.user.userId);

  res.json({
    success: true,
    data: records.map(r => ({
      id: r.id,
      reward: {
        name: r.reward_name,
        description: r.reward_description,
        imageUrl: r.reward_image_url,
        type: r.reward_type,
        drawsQuantity: r.reward_type === 'draws' ? r.reward_draws_quantity : undefined,
      },
      fragmentCost: r.fragment_cost,
      createdAt: r.created_at,
    })),
  });
});

export default router;

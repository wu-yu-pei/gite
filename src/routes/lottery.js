import { Router } from 'express';
import auth, { optionalAuth } from '../middlewares/auth.js';
import { query } from '../libs/db.js';
import {
  getTodayLottery,
  joinLottery,
  getParticipants,
  getResult,
  getMyLotteries,
} from '../services/lottery.js';

const router = Router();

/**
 * GET /api/lottery
 * 获取当天活动
 */
router.get('/api/lottery', optionalAuth, async (req, res) => {
  const userId = req.user ? req.user.userId : null;
  const lottery = await getTodayLottery(userId);

  if (!lottery) {
    return res.json({ success: true, data: null });
  }

  res.json({ success: true, data: { ...lottery, needLogin: !req.user } });
});

/**
 * POST /api/lottery/join
 * 参与当天抽奖
 */
router.post('/api/lottery/join', auth, async (req, res) => {
  const result = await joinLottery(req.user.userId);

  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error });
  }

  res.json({ success: true, data: { message: '参与成功' } });
});

/**
 * GET /api/lottery/join/list
 * 获取当天活动参与者头像列表
 */
router.get('/api/lottery/join/list', auth, async (req, res) => {
  const [lottery] = await query(
    `SELECT id FROM lotteries
     WHERE status IN ('active', 'drawn') AND DATE(created_at) = CURDATE()
     ORDER BY created_at DESC LIMIT 1`,
    []
  );

  if (!lottery) {
    return res.json({ success: true, data: [] });
  }

  const participants = await getParticipants(lottery.id);
  res.json({ success: true, data: participants });
});

/**
 * GET /api/lottery/result
 * 查看当天活动开奖结果
 */
router.get('/api/lottery/result', auth, async (req, res) => {
  const [lottery] = await query(
    `SELECT id, status, drawn_at FROM lotteries
     WHERE status IN ('active', 'drawn') AND DATE(created_at) = CURDATE()
     ORDER BY created_at DESC LIMIT 1`,
    []
  );

  if (!lottery) {
    return res.status(404).json({ success: false, error: '当前没有活动' });
  }

  if (lottery.status !== 'drawn') {
    return res.json({
      success: true,
      data: { lotteryId: lottery.id, status: lottery.status, drawnAt: null, winners: [] },
    });
  }

  const winners = await getResult(lottery.id);
  const isWinner = winners.some((w) => w.userId === req.user.userId);
  res.json({
    success: true,
    data: { lotteryId: lottery.id, status: lottery.status, drawnAt: lottery.drawn_at, isWinner, winners },
  });
});

/**
 * GET /api/lottery/my
 * 我参与的活动列表
 */
router.get('/api/lottery/my', auth, async (req, res) => {
  const list = await getMyLotteries(req.user.userId);
  res.json({ success: true, data: list });
});

export default router;

import { Router } from 'express';
import auth, { optionalAuth } from '../middlewares/auth.js';
import {
  getLotteryList,
  getLotteryDetail,
  joinLottery,
  getParticipants,
  getResult,
  getMyLotteries,
} from '../services/lottery.js';

const router = Router();

/**
 * GET /api/lottery/list
 * 获取所有可参与的活动列表
 */
router.get('/api/lottery/list', optionalAuth, async (req, res) => {
  const userId = req.user ? req.user.userId : null;
  const list = await getLotteryList(userId);
  res.json({ success: true, data: list });
});

/**
 * GET /api/lottery/my
 * 我参与的活动列表
 */
router.get('/api/lottery/my', auth, async (req, res) => {
  const list = await getMyLotteries(req.user.userId);
  res.json({ success: true, data: list });
});

/**
 * GET /api/lottery/:id
 * 获取单个活动详情
 */
router.get('/api/lottery/:id', optionalAuth, async (req, res) => {
  const lotteryId = Number(req.params.id);
  if (!Number.isFinite(lotteryId) || lotteryId <= 0) {
    return res.status(400).json({ success: false, error: '无效的活动ID' });
  }

  const userId = req.user ? req.user.userId : null;
  const lottery = await getLotteryDetail(lotteryId, userId);

  if (!lottery) {
    return res.status(404).json({ success: false, error: '活动不存在' });
  }

  res.json({ success: true, data: { ...lottery, needLogin: !req.user } });
});

/**
 * POST /api/lottery/join
 * 参与指定抽奖活动
 */
router.post('/api/lottery/join', auth, async (req, res) => {
  const { lotteryId } = req.body;
  if (!lotteryId) {
    return res.status(400).json({ success: false, error: '缺少活动ID' });
  }

  const result = await joinLottery(req.user.userId, Number(lotteryId));

  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error });
  }

  res.json({ success: true, data: { message: '参与成功' } });
});

/**
 * GET /api/lottery/:id/participants
 * 获取活动参与者头像列表
 */
router.get('/api/lottery/:id/participants', optionalAuth, async (req, res) => {
  const lotteryId = Number(req.params.id);
  if (!Number.isFinite(lotteryId) || lotteryId <= 0) {
    return res.status(400).json({ success: false, error: '无效的活动ID' });
  }

  const participants = await getParticipants(lotteryId);
  res.json({ success: true, data: participants });
});

/**
 * GET /api/lottery/:id/result
 * 查看活动开奖结果
 */
router.get('/api/lottery/:id/result', optionalAuth, async (req, res) => {
  const lotteryId = Number(req.params.id);
  if (!Number.isFinite(lotteryId) || lotteryId <= 0) {
    return res.status(400).json({ success: false, error: '无效的活动ID' });
  }

  const userId = req.user ? req.user.userId : null;
  const lottery = await getLotteryDetail(lotteryId, userId);

  if (!lottery) {
    return res.status(404).json({ success: false, error: '活动不存在' });
  }

  if (lottery.status !== 'drawn') {
    return res.json({
      success: true,
      data: { lotteryId, status: lottery.status, drawnAt: null, winners: [] },
    });
  }

  const winners = await getResult(lotteryId);
  const isWinner = userId ? winners.some((w) => w.userId === userId) : false;
  res.json({
    success: true,
    data: { lotteryId, status: lottery.status, drawnAt: lottery.drawnAt, isWinner, winners },
  });
});

export default router;

import crypto from 'crypto';
import { Router } from 'express';
import auth, { optionalAuth } from '../middlewares/auth.js';
import { query } from '../libs/db.js';
import config from '../config/index.js';
import redis from '../libs/redis.js';
import {
  getOrCreateDailyState,
  getRemainingDraws,
  getAllDisplayPrizes,
  executeDraw,
} from '../services/spin.js';
import { completeAdTask, recordInvitation, getTodayInviteCount } from '../services/task.js';
import { getFragmentBalance } from '../services/exchange.js';

const router = Router();

/**
 * GET /api/spin/home
 * 首页数据：奖品九宫格、每日状态、任务进度
 */
router.get('/api/spin/home', optionalAuth, async (req, res) => {
  const userId = req.user?.userId;

  const [prizes, taskConfigs] = await Promise.all([
    getAllDisplayPrizes(),
    query(`SELECT task_key, is_visible FROM task_configs`),
  ]);

  const visibilityMap = {};
  for (const tc of taskConfigs) {
    visibilityMap[tc.task_key] = !!tc.is_visible;
  }

  let remaining = 0;
  let fragmentBalance = 0;
  let totalDraws = 0;
  let tasks = {
    ad: { visible: visibilityMap.ad ?? true, done: false, drawsEarned: 0 },
    invite: { visible: visibilityMap.invite ?? true, done: false, locked: true, todayInvites: 0, requiredInvites: 3, drawsEarned: 0 },
  };

  if (userId) {
    const [state, inviteCount, balance, [totalRow]] = await Promise.all([
      getOrCreateDailyState(userId),
      getTodayInviteCount(userId),
      getFragmentBalance(userId),
      query(`SELECT COUNT(*) AS cnt FROM draw_records WHERE user_id = ?`, [userId]),
    ]);
    totalDraws = totalRow.cnt;
    remaining = getRemainingDraws(state);
    fragmentBalance = balance;
    tasks = {
      ad: {
        visible: visibilityMap.ad ?? true,
        done: !!state.ad_task_done,
        drawsEarned: state.ad_draws_earned,
      },
      invite: {
        visible: visibilityMap.invite ?? true,
        done: !!state.invite_task_done,
        locked: !state.ad_task_done,
        todayInvites: inviteCount,
        requiredInvites: 3,
        drawsEarned: state.invite_draws_earned,
      },
    };
  }

  res.json({
    success: true,
    data: {
      prizes: prizes.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        imageUrl: p.image_url,
        type: p.type,
        fragmentQuantity: p.type === 'fragment' ? p.fragment_quantity : undefined,
        sortOrder: p.sort_order,
      })),
      remainingDraws: remaining,
      totalDraws,
      fragmentBalance,
      tasks,
    },
  });
});

/**
 * POST /api/spin/draw
 * 执行一次抽奖
 */
router.post('/api/spin/draw', auth, async (req, res) => {
  const result = await executeDraw(req.user.userId);

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
});

/**
 * POST /api/spin/task/ad
 * 完成观看广告任务
 */
router.post('/api/spin/task/ad', auth, async (req, res) => {
  const result = await completeAdTask(req.user.userId);

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
});

/**
 * POST /api/spin/task/invite
 * 记录邀请 — 带防重放、防篡改校验
 */
router.post('/api/spin/task/invite', auth, async (req, res) => {
  const { inviterId, timestamp, nonce, signature } = req.body;

  if (!inviterId || !timestamp || !nonce || !signature) {
    return res.status(400).json({ success: false, error: '缺少必要参数' });
  }

  // 1. 时间戳校验：请求必须在 maxAge 秒内
  const now = Math.floor(Date.now() / 1000);
  const maxAge = config.invite.maxAge;
  if (Math.abs(now - Number(timestamp)) > maxAge) {
    return res.status(400).json({ success: false, error: '请求已过期' });
  }

  // 2. 签名校验：防篡改
  const expected = crypto
    .createHmac('sha256', config.invite.signKey)
    .update(`${inviterId}:${timestamp}:${nonce}`)
    .digest('hex');
  if (signature !== expected) {
    return res.status(400).json({ success: false, error: '签名验证失败' });
  }

  // 3. Nonce 校验：防重放（Redis 存储，TTL = maxAge）
  const nonceKey = `invite:nonce:${nonce}`;
  const existed = await redis.set(nonceKey, '1', 'EX', maxAge, 'NX');
  if (!existed) {
    return res.status(400).json({ success: false, error: '请勿重复提交' });
  }

  const inviteeId = req.user.userId;
  const result = await recordInvitation(Number(inviterId), inviteeId);

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
});

/**
 * GET /api/spin/records
 * 用户抽奖历史记录
 */
router.get('/api/spin/records', auth, async (req, res) => {
  const records = await query(
    `SELECT dr.id, dr.is_pity, dr.created_at,
            p.name AS prize_name, p.description AS prize_description, p.image_url AS prize_image_url, p.type AS prize_type
     FROM draw_records dr
     JOIN prizes p ON p.id = dr.prize_id
     WHERE dr.user_id = ?
     ORDER BY dr.created_at DESC
     LIMIT 50`,
    [req.user.userId]
  );

  res.json({
    success: true,
    data: records.map(r => ({
      id: r.id,
      prize: {
        name: r.prize_name,
        description: r.prize_description,
        imageUrl: r.prize_image_url,
        type: r.prize_type,
      },
      isPity: !!r.is_pity,
      createdAt: r.created_at,
    })),
  });
});

export default router;

import { Router } from 'express';
import auth from '../middlewares/auth.js';
import { query } from '../libs/db.js';
import {
  getOrCreateDailyState,
  getRemainingDraws,
  getAllDisplayPrizes,
  executeDraw,
} from '../services/spin.js';
import { completeAdTask, recordInvitation, getTodayInviteCount } from '../services/task.js';

const router = Router();

/**
 * GET /api/spin/home
 * 首页数据：奖品九宫格、每日状态、任务进度
 */
router.get('/api/spin/home', auth, async (req, res) => {
  const userId = req.user.userId;

  const [prizes, state, inviteCount] = await Promise.all([
    getAllDisplayPrizes(),
    getOrCreateDailyState(userId),
    getTodayInviteCount(userId),
  ]);

  const remaining = getRemainingDraws(state);

  res.json({
    success: true,
    data: {
      prizes: prizes.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        imageUrl: p.image_url,
        type: p.type,
        sortOrder: p.sort_order,
      })),
      remainingDraws: remaining,
      tasks: {
        ad: {
          done: !!state.ad_task_done,
          drawsEarned: state.ad_draws_earned,
        },
        invite: {
          done: !!state.invite_task_done,
          locked: !state.ad_task_done,
          todayInvites: inviteCount,
          requiredInvites: 3,
          drawsEarned: state.invite_draws_earned,
        },
      },
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
 * 记录邀请（被邀请人通过分享链接进入小程序时调用）
 */
router.post('/api/spin/task/invite', auth, async (req, res) => {
  const { inviterId } = req.body;

  if (!inviterId) {
    return res.status(400).json({ success: false, error: '缺少 inviterId 参数' });
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

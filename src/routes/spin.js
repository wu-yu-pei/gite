import { Router } from 'express';
import auth, { optionalAuth } from '../middlewares/auth.js';
import {
  getSpinList,
  getSpinDetail,
  calcDrawSources,
  pickSource,
  completeTask,
  getSpinRecords,
} from '../services/spin.js';
import { executeSpinDraw } from '../services/spin-draw.js';

const router = Router();

/**
 * GET /api/spin/list
 */
router.get('/api/spin/list', optionalAuth, async (req, res) => {
  const list = await getSpinList();
  res.json({ success: true, data: list });
});

/**
 * GET /api/spin/:id
 */
router.get('/api/spin/:id', optionalAuth, async (req, res) => {
  const activityId = Number(req.params.id);
  if (!Number.isFinite(activityId) || activityId <= 0) {
    return res.status(400).json({ success: false, error: '无效的活动ID' });
  }

  const userId = req.user ? req.user.userId : null;
  const detail = await getSpinDetail(activityId, userId);

  if (!detail) {
    return res.status(404).json({ success: false, error: '活动不存在' });
  }

  res.json({ success: true, data: { ...detail, needLogin: !req.user } });
});

/**
 * POST /api/spin/:id/draw
 */
router.post('/api/spin/:id/draw', auth, async (req, res) => {
  const activityId = Number(req.params.id);
  if (!Number.isFinite(activityId) || activityId <= 0) {
    return res.status(400).json({ success: false, error: '无效的活动ID' });
  }

  const userId = req.user.userId;

  const detail = await getSpinDetail(activityId, userId);
  if (!detail) {
    return res.status(404).json({ success: false, error: '活动不存在' });
  }
  if (detail.status !== 'active') {
    return res.status(400).json({ success: false, error: '活动不在进行中' });
  }
  const now = new Date();
  if (now < new Date(detail.startAt) || now > new Date(detail.endAt)) {
    return res.status(400).json({ success: false, error: '不在活动时间范围内' });
  }

  const drawSources = await calcDrawSources(activityId, userId);
  const source = pickSource(drawSources);
  if (!source) {
    return res.status(400).json({ success: false, error: '今日抽奖次数已用完' });
  }

  const prize = await executeSpinDraw(activityId, userId, source);

  const updatedSources = await calcDrawSources(activityId, userId);
  const remainingDraws = Object.values(updatedSources).reduce((sum, s) => sum + s.remaining, 0);

  res.json({ success: true, data: { prize, remainingDraws } });
});

/**
 * POST /api/spin/:id/task
 */
router.post('/api/spin/:id/task', auth, async (req, res) => {
  const activityId = Number(req.params.id);
  if (!Number.isFinite(activityId) || activityId <= 0) {
    return res.status(400).json({ success: false, error: '无效的活动ID' });
  }

  const { taskType } = req.body;
  if (!taskType || !['checkin', 'share'].includes(taskType)) {
    return res.status(400).json({ success: false, error: '无效的任务类型' });
  }

  const result = await completeTask(activityId, req.user.userId, taskType);

  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error });
  }

  res.json({ success: true, data: { message: result.message, remainingDraws: result.remainingDraws } });
});

/**
 * GET /api/spin/:id/records
 */
router.get('/api/spin/:id/records', auth, async (req, res) => {
  const activityId = Number(req.params.id);
  if (!Number.isFinite(activityId) || activityId <= 0) {
    return res.status(400).json({ success: false, error: '无效的活动ID' });
  }

  const records = await getSpinRecords(activityId, req.user.userId);
  res.json({ success: true, data: records });
});

export default router;

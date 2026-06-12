import { query } from '../libs/db.js';

/**
 * Get all active spin activities.
 */
export async function getSpinList() {
  const rows = await query(
    `SELECT id, title, description, display_type, start_at, end_at, status
     FROM spin_activities
     WHERE status = 'active'
     ORDER BY created_at DESC`,
    []
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    displayType: r.display_type,
    startAt: r.start_at,
    endAt: r.end_at,
    status: r.status,
  }));
}

/**
 * Get spin activity detail with prizes and user draw info.
 */
export async function getSpinDetail(activityId, userId) {
  const [activity] = await query(
    `SELECT id, title, description, display_type, start_at, end_at, status
     FROM spin_activities WHERE id = ?`,
    [activityId]
  );

  if (!activity) return null;

  const prizes = await query(
    `SELECT id, name, type, image_url, sort_order
     FROM spin_prizes WHERE activity_id = ?
     ORDER BY sort_order ASC`,
    [activityId]
  );

  const drawSources = userId ? await calcDrawSources(activityId, userId) : null;
  const remainingDraws = drawSources
    ? Object.values(drawSources).reduce((sum, s) => sum + s.remaining, 0)
    : 0;

  return {
    id: activity.id,
    title: activity.title,
    description: activity.description,
    displayType: activity.display_type,
    startAt: activity.start_at,
    endAt: activity.end_at,
    status: activity.status,
    prizes: prizes.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      imageUrl: p.image_url,
      sortOrder: p.sort_order,
    })),
    remainingDraws,
    drawSources,
  };
}

/**
 * Calculate draw sources breakdown for a user on a given activity today.
 */
export async function calcDrawSources(activityId, userId) {
  const configs = await query(
    'SELECT source, daily_limit FROM spin_free_config WHERE activity_id = ?',
    [activityId]
  );

  const configMap = Object.fromEntries(configs.map((c) => [c.source, c.daily_limit]));

  // Count today's draws per source
  const usedRows = await query(
    `SELECT source, COUNT(*) AS cnt FROM spin_records
     WHERE activity_id = ? AND user_id = ? AND DATE(created_at) = CURDATE()
     GROUP BY source`,
    [activityId, userId]
  );
  const usedMap = Object.fromEntries(usedRows.map((r) => [r.source, r.cnt]));

  // Count today's task completions
  const taskRows = await query(
    `SELECT task_type, COUNT(*) AS cnt FROM spin_task_records
     WHERE activity_id = ? AND user_id = ? AND DATE(created_at) = CURDATE()
     GROUP BY task_type`,
    [activityId, userId]
  );
  const taskMap = Object.fromEntries(taskRows.map((r) => [r.task_type, r.cnt]));

  const result = {};

  // base
  const baseLimit = configMap.base || 0;
  const baseUsed = usedMap.base || 0;
  result.base = { used: baseUsed, limit: baseLimit, remaining: Math.max(0, baseLimit - baseUsed) };

  // checkin
  const checkinLimit = configMap.checkin || 0;
  const checkinUsed = usedMap.checkin || 0;
  const checkinDone = (taskMap.checkin || 0) > 0;
  result.checkin = {
    used: checkinUsed,
    limit: checkinLimit,
    remaining: checkinDone ? Math.max(0, checkinLimit - checkinUsed) : 0,
    done: checkinDone,
  };

  // share
  const shareLimit = configMap.share || 0;
  const shareUsed = usedMap.share || 0;
  const shareDone = taskMap.share || 0;
  result.share = {
    used: shareUsed,
    limit: shareLimit,
    remaining: Math.max(0, Math.min(shareLimit, shareDone) - shareUsed),
    done: shareDone,
  };

  return result;
}

/**
 * Determine which source to consume for this draw.
 * Order: base -> checkin -> share
 */
export function pickSource(drawSources) {
  if (drawSources.base.remaining > 0) return 'base';
  if (drawSources.checkin.remaining > 0) return 'checkin';
  if (drawSources.share.remaining > 0) return 'share';
  return null;
}

/**
 * Complete a task (checkin or share) for extra draws.
 */
export async function completeTask(activityId, userId, taskType) {
  const [activity] = await query(
    `SELECT id, status, start_at, end_at FROM spin_activities WHERE id = ?`,
    [activityId]
  );

  if (!activity || activity.status !== 'active') {
    return { success: false, error: '活动不存在或已结束' };
  }

  const now = new Date();
  if (now < new Date(activity.start_at) || now > new Date(activity.end_at)) {
    return { success: false, error: '不在活动时间范围内' };
  }

  const [config] = await query(
    'SELECT daily_limit FROM spin_free_config WHERE activity_id = ? AND source = ?',
    [activityId, taskType]
  );

  if (!config) {
    return { success: false, error: '该任务类型未配置' };
  }

  if (taskType === 'checkin') {
    const [existing] = await query(
      `SELECT 1 FROM spin_task_records
       WHERE activity_id = ? AND user_id = ? AND task_type = 'checkin' AND DATE(created_at) = CURDATE()`,
      [activityId, userId]
    );
    if (existing) {
      return { success: false, error: '今日已签到' };
    }
  } else if (taskType === 'share') {
    const [countRow] = await query(
      `SELECT COUNT(*) AS cnt FROM spin_task_records
       WHERE activity_id = ? AND user_id = ? AND task_type = 'share' AND DATE(created_at) = CURDATE()`,
      [activityId, userId]
    );
    if (countRow.cnt >= config.daily_limit) {
      return { success: false, error: '今日分享次数已达上限' };
    }
  }

  await query(
    'INSERT INTO spin_task_records (activity_id, user_id, task_type) VALUES (?, ?, ?)',
    [activityId, userId, taskType]
  );

  const drawSources = await calcDrawSources(activityId, userId);
  const remainingDraws = Object.values(drawSources).reduce((sum, s) => sum + s.remaining, 0);

  const messages = { checkin: '签到成功', share: '分享成功' };
  return { success: true, message: messages[taskType], remainingDraws };
}

/**
 * Get user's draw records for an activity.
 */
export async function getSpinRecords(activityId, userId) {
  const rows = await query(
    `SELECT sr.id, sp.name AS prize_name, sp.type AS prize_type, sp.image_url AS prize_image_url,
            sr.created_at
     FROM spin_records sr
     JOIN spin_prizes sp ON sp.id = sr.prize_id
     WHERE sr.activity_id = ? AND sr.user_id = ?
     ORDER BY sr.created_at DESC`,
    [activityId, userId]
  );
  return rows.map((r) => ({
    id: r.id,
    prize: { name: r.prize_name, type: r.prize_type, imageUrl: r.prize_image_url },
    createdAt: r.created_at,
  }));
}

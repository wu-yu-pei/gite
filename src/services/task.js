import { query } from '../libs/db.js';
import { getOrCreateDailyState } from './spin.js';

/**
 * 完成观看广告任务，奖励1次额外抽奖机会。
 */
export async function completeAdTask(userId) {
  const state = await getOrCreateDailyState(userId);

  if (state.ad_task_done) {
    return { success: false, error: '今日已完成观看广告任务' };
  }

  await query(
    `UPDATE user_daily_state SET ad_task_done = 1, ad_draws_earned = 1 WHERE user_id = ? AND date = ?`,
    [userId, state.date]
  );

  return { success: true, data: { drawsEarned: 1, message: '观看广告成功，获得1次抽奖机会' } };
}

/**
 * 记录一次邀请。当今日邀请满3人时，奖励3次抽奖机会。
 */
export async function recordInvitation(inviterId, inviteeId) {
  if (inviterId === inviteeId) {
    return { success: false, error: '不能邀请自己' };
  }

  const state = await getOrCreateDailyState(inviterId);

  if (!state.ad_task_done) {
    return { success: false, error: '请先完成观看广告任务' };
  }

  if (state.invite_task_done) {
    return { success: false, error: '今日邀请任务已完成' };
  }

  const [existing] = await query(
    `SELECT id FROM invitations WHERE invitee_id = ?`,
    [inviteeId]
  );
  if (existing) {
    return { success: false, error: '该用户已被其他人邀请' };
  }

  await query(
    `INSERT INTO invitations (inviter_id, invitee_id) VALUES (?, ?)`,
    [inviterId, inviteeId]
  );

  const today = new Date().toLocaleDateString('sv-SE');
  const [countRow] = await query(
    `SELECT COUNT(*) AS cnt FROM invitations WHERE inviter_id = ? AND DATE(created_at) = ?`,
    [inviterId, today]
  );
  const todayCount = countRow.cnt;

  if (todayCount >= 3) {
    await query(
      `UPDATE user_daily_state SET invite_task_done = 1, invite_draws_earned = 3 WHERE user_id = ? AND date = ?`,
      [inviterId, state.date]
    );
    return { success: true, data: { todayInvites: todayCount, drawsEarned: 3, message: '邀请任务完成，获得3次抽奖机会' } };
  }

  return { success: true, data: { todayInvites: todayCount, drawsEarned: 0, message: `已邀请${todayCount}人，还需${3 - todayCount}人` } };
}

/**
 * 获取用户今日邀请人数。
 */
export async function getTodayInviteCount(userId) {
  const today = new Date().toLocaleDateString('sv-SE');
  const [row] = await query(
    `SELECT COUNT(*) AS cnt FROM invitations WHERE inviter_id = ? AND DATE(created_at) = ?`,
    [userId, today]
  );
  return row.cnt;
}

import { query } from '../libs/db.js';
import { executeDraw } from './draw.js';
import logger from '../utils/logger.js';

export async function getTodayLottery(userId) {
  const [lottery] = await query(
    `SELECT l.id, l.title, l.description, l.winner_count, l.draw_mode,
            l.draw_at, l.max_participants, l.status, l.drawn_at, l.created_at,
            p.id AS prize_id, p.name AS prize_name, p.type AS prize_type, p.image_url AS prize_image_url
     FROM lotteries l
     JOIN prizes p ON p.id = l.prize_id
     WHERE l.status IN ('active', 'drawn') AND DATE(l.created_at) = CURDATE()
     ORDER BY l.created_at DESC
     LIMIT 1`,
    []
  );

  if (!lottery) {
    return null;
  }

  const [countRow] = await query(
    'SELECT COUNT(*) AS cnt FROM lottery_participants WHERE lottery_id = ?',
    [lottery.id]
  );

  let hasJoined = false;
  if (userId) {
    const [joinRow] = await query(
      'SELECT 1 AS joined FROM lottery_participants WHERE lottery_id = ? AND user_id = ?',
      [lottery.id, userId]
    );
    hasJoined = !!joinRow;
  }

  return {
    id: lottery.id,
    title: lottery.title,
    description: lottery.description,
    prize: {
      id: lottery.prize_id,
      name: lottery.prize_name,
      type: lottery.prize_type,
      imageUrl: lottery.prize_image_url,
    },
    winnerCount: lottery.winner_count,
    drawMode: lottery.draw_mode,
    drawAt: lottery.draw_at,
    maxParticipants: lottery.max_participants,
    status: lottery.status,
    drawnAt: lottery.drawn_at,
    participantCount: countRow.cnt,
    hasJoined,
  };
}

export async function joinLottery(userId) {
  const [lottery] = await query(
    `SELECT id, draw_mode, max_participants FROM lotteries
     WHERE status = 'active' AND DATE(created_at) = CURDATE()
     ORDER BY created_at DESC LIMIT 1`,
    []
  );

  if (!lottery) {
    return { success: false, error: '当前没有进行中的活动' };
  }

  try {
    await query(
      'INSERT INTO lottery_participants (lottery_id, user_id) VALUES (?, ?)',
      [lottery.id, userId]
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return { success: false, error: '您已经参与过该活动' };
    }
    throw err;
  }

  // Check if full-draw should trigger
  if (lottery.draw_mode === 'full' && lottery.max_participants) {
    const [countRow] = await query(
      'SELECT COUNT(*) AS cnt FROM lottery_participants WHERE lottery_id = ?',
      [lottery.id]
    );
    if (countRow.cnt >= lottery.max_participants) {
      try {
        await executeDraw(lottery.id);
      } catch (err) {
        logger.error({ err, lotteryId: lottery.id }, 'Full-draw trigger failed');
      }
    }
  }

  return { success: true };
}

export async function getParticipants(lotteryId) {
  const rows = await query(
    `SELECT u.id AS userId, u.avatar_url AS avatarUrl, u.nick_name AS nickName
     FROM lottery_participants lp
     JOIN users u ON u.id = lp.user_id
     WHERE lp.lottery_id = ?
     ORDER BY lp.created_at ASC`,
    [lotteryId]
  );
  return rows;
}

export async function getResult(lotteryId) {
  const rows = await query(
    `SELECT u.id AS userId, u.nick_name AS nickName, u.avatar_url AS avatarUrl
     FROM lottery_participants lp
     JOIN users u ON u.id = lp.user_id
     WHERE lp.lottery_id = ? AND lp.is_winner = 1`,
    [lotteryId]
  );
  return rows;
}

export async function getMyLotteries(userId) {
  const rows = await query(
    `SELECT l.id AS lotteryId, l.title, l.status, lp.is_winner AS isWinner,
            p.name AS prize_name, p.type AS prize_type, p.image_url AS prize_image_url,
            lp.created_at AS createdAt
     FROM lottery_participants lp
     JOIN lotteries l ON l.id = lp.lottery_id
     JOIN prizes p ON p.id = l.prize_id
     WHERE lp.user_id = ?
     ORDER BY lp.created_at DESC`,
    [userId]
  );
  return rows.map((r) => ({
    lotteryId: r.lotteryId,
    title: r.title,
    status: r.status,
    isWinner: !!r.isWinner,
    prize: {
      name: r.prize_name,
      type: r.prize_type,
      imageUrl: r.prize_image_url,
    },
    createdAt: r.createdAt,
  }));
}

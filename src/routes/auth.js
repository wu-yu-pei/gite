import { Router } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { query } from '../libs/db.js';
import { code2Session } from '../services/wechat.js';
import auth from '../middlewares/auth.js';

const router = Router();

/**
 * POST /api/auth/login
 * 微信小程序登录
 */
router.post('/api/auth/login', async (req, res) => {
  const { code, nickName, avatarUrl } = req.body;

  if (!code) {
    return res.status(400).json({ success: false, error: 'code is required' });
  }

  const { openid, sessionKey } = await code2Session(code);

  const [existing] = await query('SELECT * FROM users WHERE openid = ?', [openid]);

  let user;

  if (existing) {
    await query(
      'UPDATE users SET session_key = ?, nick_name = COALESCE(?, nick_name), avatar_url = COALESCE(?, avatar_url) WHERE id = ?',
      [sessionKey, nickName || null, avatarUrl || null, existing.id]
    );
    user = {
      id: existing.id,
      nickName: nickName || existing.nick_name,
      avatarUrl: avatarUrl || existing.avatar_url,
    };
  } else {
    const result = await query(
      'INSERT INTO users (openid, session_key, nick_name, avatar_url) VALUES (?, ?, ?, ?)',
      [openid, sessionKey, nickName || '', avatarUrl || '']
    );
    user = {
      id: result.insertId,
      nickName: nickName || '',
      avatarUrl: avatarUrl || '',
    };
  }

  const token = jwt.sign(
    { userId: user.id, openid },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

  res.json({
    success: true,
    data: { token, user },
  });
});

/**
 * GET /api/auth/me
 * 获取当前用户信息
 */
router.get('/api/auth/me', auth, async (req, res) => {
  const [user] = await query(
    'SELECT id, nick_name, avatar_url, created_at FROM users WHERE id = ?',
    [req.user.userId]
  );

  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  res.json({
    success: true,
    data: {
      id: user.id,
      nickName: user.nick_name,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at,
    },
  });
});

export default router;

# Spin Lottery (Instant-Win) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an instant-win lottery system (wheel/grid) with configurable prizes, probabilities, stock, and a multi-source free draw system (base + checkin + share).

**Architecture:** Independent module alongside existing participation lottery. Five new DB tables (`spin_*`), two service files (`spin.js`, `spin-draw.js`), one route file (`spin.js`). No cron needed — draws are instant per-request. Stock management uses MySQL optimistic updates.

**Tech Stack:** Express.js, mysql2/promise, existing auth middleware, existing logger (pino)

**Spec:** `docs/superpowers/specs/2026-06-12-spin-lottery-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/db/migrations/006_create_spin_activities.sql` | Activities table |
| Create | `src/db/migrations/007_create_spin_prizes.sql` | Prize config table |
| Create | `src/db/migrations/008_create_spin_free_config.sql` | Free draw config table |
| Create | `src/db/migrations/009_create_spin_records.sql` | Draw records table |
| Create | `src/db/migrations/010_create_spin_task_records.sql` | Task completion records |
| Create | `src/services/spin-draw.js` | Probability engine + stock deduction |
| Create | `src/services/spin.js` | Activity queries, draw count calc, task completion |
| Create | `src/routes/spin.js` | 5 API endpoints |
| Modify | `src/app.js` | Mount spin router |

---

### Task 1: Database Migrations

**Files:**
- Create: `src/db/migrations/006_create_spin_activities.sql`
- Create: `src/db/migrations/007_create_spin_prizes.sql`
- Create: `src/db/migrations/008_create_spin_free_config.sql`
- Create: `src/db/migrations/009_create_spin_records.sql`
- Create: `src/db/migrations/010_create_spin_task_records.sql`

- [ ] **Step 1: Create spin_activities migration**

```sql
-- src/db/migrations/006_create_spin_activities.sql
CREATE TABLE IF NOT EXISTS spin_activities (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(128) NOT NULL,
  description TEXT,
  display_type ENUM('wheel', 'grid') NOT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  status ENUM('active', 'ended', 'cancelled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status_time (status, start_at, end_at)
);
```

- [ ] **Step 2: Create spin_prizes migration**

```sql
-- src/db/migrations/007_create_spin_prizes.sql
CREATE TABLE IF NOT EXISTS spin_prizes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  activity_id INT UNSIGNED NOT NULL,
  name VARCHAR(128) NOT NULL,
  type VARCHAR(64) NOT NULL,
  image_url VARCHAR(512) DEFAULT NULL,
  probability DECIMAL(8, 5) NOT NULL,
  stock INT DEFAULT NULL,
  sort_order INT UNSIGNED DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_activity (activity_id)
);
```

- [ ] **Step 3: Create spin_free_config migration**

```sql
-- src/db/migrations/008_create_spin_free_config.sql
CREATE TABLE IF NOT EXISTS spin_free_config (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  activity_id INT UNSIGNED NOT NULL,
  source ENUM('base', 'checkin', 'share') NOT NULL,
  daily_limit INT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_activity_source (activity_id, source)
);
```

- [ ] **Step 4: Create spin_records migration**

```sql
-- src/db/migrations/009_create_spin_records.sql
CREATE TABLE IF NOT EXISTS spin_records (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  activity_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  prize_id INT UNSIGNED NOT NULL,
  source ENUM('base', 'checkin', 'share') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_activity_date (user_id, activity_id, created_at)
);
```

- [ ] **Step 5: Create spin_task_records migration**

```sql
-- src/db/migrations/010_create_spin_task_records.sql
CREATE TABLE IF NOT EXISTS spin_task_records (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  activity_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  task_type ENUM('checkin', 'share') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_activity_task (user_id, activity_id, task_type, created_at)
);
```

- [ ] **Step 6: Run migrations to verify**

Run: `mysql -u root -p < src/db/migrations/006_create_spin_activities.sql`

Repeat for 007–010. Verify all tables created with `SHOW TABLES LIKE 'spin_%';`

- [ ] **Step 7: Commit**

```bash
git add src/db/migrations/006_create_spin_activities.sql src/db/migrations/007_create_spin_prizes.sql src/db/migrations/008_create_spin_free_config.sql src/db/migrations/009_create_spin_records.sql src/db/migrations/010_create_spin_task_records.sql
git commit -m "feat: add spin lottery database migrations (5 tables)"
```

---

### Task 2: Spin Draw Service (Probability Engine)

**Files:**
- Create: `src/services/spin-draw.js`

- [ ] **Step 1: Create the spin-draw service**

```js
// src/services/spin-draw.js
import pool from '../libs/db.js';
import { query } from '../libs/db.js';
import logger from '../utils/logger.js';

/**
 * Execute a single instant draw for a user.
 * Returns the won prize row (with id, name, type, image_url).
 *
 * @param {number} activityId
 * @param {number} userId
 * @param {string} source - 'base' | 'checkin' | 'share'
 * @returns {Promise<{id: number, name: string, type: string, image_url: string|null}>}
 */
export async function executeSpinDraw(activityId, userId, source) {
  const prizes = await query(
    'SELECT id, name, type, image_url, probability, stock FROM spin_prizes WHERE activity_id = ?',
    [activityId]
  );

  const noneItem = prizes.find((p) => p.type === 'none');
  if (!noneItem) {
    throw new Error(`Activity ${activityId} has no "none" prize configured`);
  }

  // Build effective probability list: exhausted stock prizes redirect to "none"
  let bonusProbability = 0;
  const eligible = [];

  for (const p of prizes) {
    if (p.type === 'none') continue;
    if (p.stock !== null && p.stock <= 0) {
      bonusProbability += Number(p.probability);
    } else {
      eligible.push({ ...p, probability: Number(p.probability) });
    }
  }

  eligible.push({
    ...noneItem,
    probability: Number(noneItem.probability) + bonusProbability,
  });

  // Weighted random pick
  const rand = Math.random();
  let cumulative = 0;
  let picked = eligible[eligible.length - 1]; // fallback to last (none)

  for (const item of eligible) {
    cumulative += item.probability;
    if (rand < cumulative) {
      picked = item;
      break;
    }
  }

  // If picked prize has stock, try to deduct atomically
  if (picked.type !== 'none' && picked.stock !== null) {
    const [result] = await pool.execute(
      'UPDATE spin_prizes SET stock = stock - 1 WHERE id = ? AND stock > 0',
      [picked.id]
    );
    if (result.affectedRows === 0) {
      logger.info({ activityId, prizeId: picked.id }, '[SpinDraw] Stock race, falling back to none');
      picked = noneItem;
    }
  }

  // Record the draw
  await query(
    'INSERT INTO spin_records (activity_id, user_id, prize_id, source) VALUES (?, ?, ?, ?)',
    [activityId, userId, picked.id, source]
  );

  logger.info(
    { activityId, userId, prizeId: picked.id, prizeName: picked.name, source },
    '[SpinDraw] Draw completed'
  );

  return { id: picked.id, name: picked.name, type: picked.type, imageUrl: picked.image_url };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/spin-draw.js
git commit -m "feat: add spin draw probability engine with stock deduction"
```

---

### Task 3: Spin Service (Activity Queries + Draw Count)

**Files:**
- Create: `src/services/spin.js`

- [ ] **Step 1: Create the spin service**

```js
// src/services/spin.js
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
 * Returns: { base: { used, limit, remaining }, checkin: { used, limit, remaining, done }, share: { used, limit, remaining, done } }
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
 * Order: base → checkin → share
 * Returns source string or null if no draws remain.
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
  // Validate activity
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

  // Check daily limit for this task type
  const [config] = await query(
    'SELECT daily_limit FROM spin_free_config WHERE activity_id = ? AND source = ?',
    [activityId, taskType]
  );

  if (!config) {
    return { success: false, error: '该任务类型未配置' };
  }

  if (taskType === 'checkin') {
    // Checkin: once per day
    const [existing] = await query(
      `SELECT 1 FROM spin_task_records
       WHERE activity_id = ? AND user_id = ? AND task_type = 'checkin' AND DATE(created_at) = CURDATE()`,
      [activityId, userId]
    );
    if (existing) {
      return { success: false, error: '今日已签到' };
    }
  } else if (taskType === 'share') {
    // Share: check daily limit
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
```

- [ ] **Step 2: Commit**

```bash
git add src/services/spin.js
git commit -m "feat: add spin service with activity queries, draw count calc, and task completion"
```

---

### Task 4: Spin Routes

**Files:**
- Create: `src/routes/spin.js`

- [ ] **Step 1: Create the spin routes**

```js
// src/routes/spin.js
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
 * 获取所有可参与的即时抽奖活动
 */
router.get('/api/spin/list', optionalAuth, async (req, res) => {
  const list = await getSpinList();
  res.json({ success: true, data: list });
});

/**
 * GET /api/spin/:id
 * 获取活动详情 + 奖品列表 + 用户剩余次数
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
 * 执行一次抽奖
 */
router.post('/api/spin/:id/draw', auth, async (req, res) => {
  const activityId = Number(req.params.id);
  if (!Number.isFinite(activityId) || activityId <= 0) {
    return res.status(400).json({ success: false, error: '无效的活动ID' });
  }

  const userId = req.user.userId;

  // Validate activity is active and within time window
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

  // Check remaining draws
  const drawSources = await calcDrawSources(activityId, userId);
  const source = pickSource(drawSources);
  if (!source) {
    return res.status(400).json({ success: false, error: '今日抽奖次数已用完' });
  }

  // Execute draw
  const prize = await executeSpinDraw(activityId, userId, source);

  // Recalculate remaining
  const updatedSources = await calcDrawSources(activityId, userId);
  const remainingDraws = Object.values(updatedSources).reduce((sum, s) => sum + s.remaining, 0);

  res.json({ success: true, data: { prize, remainingDraws } });
});

/**
 * POST /api/spin/:id/task
 * 完成任务获取额外次数
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
 * 用户在该活动的抽奖记录
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
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/spin.js
git commit -m "feat: add spin lottery API routes (list, detail, draw, task, records)"
```

---

### Task 5: Mount Router + Smoke Test

**Files:**
- Modify: `src/app.js:1-20`

- [ ] **Step 1: Add spin router to app.js**

Add the import and mount line to `src/app.js`:

```js
// Add after: import lotteryRouter from './routes/lottery.js';
import spinRouter from './routes/spin.js';

// Add after: app.use(lotteryRouter);
app.use(spinRouter);
```

- [ ] **Step 2: Insert test seed data**

Run in MySQL to create a test activity with prizes and free config:

```sql
-- Test activity
INSERT INTO spin_activities (title, description, display_type, start_at, end_at, status)
VALUES ('测试转盘', '测试用转盘抽奖', 'wheel', '2026-06-01 00:00:00', '2026-12-31 23:59:59', 'active');

SET @aid = LAST_INSERT_ID();

-- Prizes (probabilities sum to 1.0)
INSERT INTO spin_prizes (activity_id, name, type, image_url, probability, stock, sort_order) VALUES
(@aid, 'iPhone 16', 'physical', NULL, 0.01000, 1, 0),
(@aid, '10元优惠券', 'coupon', NULL, 0.10000, NULL, 1),
(@aid, '5元优惠券', 'coupon', NULL, 0.20000, NULL, 2),
(@aid, '虚拟积分100', 'virtual', NULL, 0.19000, NULL, 3),
(@aid, '谢谢参与', 'none', NULL, 0.50000, NULL, 4);

-- Free config: 3 base + 1 checkin + 2 share = 6 max per day
INSERT INTO spin_free_config (activity_id, source, daily_limit) VALUES
(@aid, 'base', 3),
(@aid, 'checkin', 1),
(@aid, 'share', 2);
```

- [ ] **Step 3: Start server and verify endpoints**

```bash
npm run dev
```

Test with curl:

```bash
# List activities
curl http://localhost:3000/api/spin/list

# Get detail (replace 1 with actual ID)
curl http://localhost:3000/api/spin/1

# Draw (replace TOKEN with valid JWT)
curl -X POST http://localhost:3000/api/spin/1/draw -H "Authorization: Bearer TOKEN"

# Complete checkin task
curl -X POST http://localhost:3000/api/spin/1/task -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" -d '{"taskType":"checkin"}'

# Get records
curl http://localhost:3000/api/spin/1/records -H "Authorization: Bearer TOKEN"
```

- [ ] **Step 4: Commit**

```bash
git add src/app.js
git commit -m "feat: mount spin lottery router in app"
```

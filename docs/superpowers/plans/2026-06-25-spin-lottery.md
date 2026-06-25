# 即时抽奖功能 实现计划

> **给执行者：** 必须使用子技能：superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 来逐任务执行本计划。步骤使用复选框 (`- [ ]`) 语法来跟踪进度。
>
> **前端任务要求（任务 8-14）：** 执行前端任务时，agent **必须**先调用 `frontend-design` skill，使用该 skill 的设计规范和流程来实现页面与组件。不得跳过此 skill 直接编写前端代码。

**目标：** 构建一个九宫格抽奖小程序，支持可配置的奖品概率、保底系统（连续N次未中奖则必中）、每日免费抽奖、激励广告任务和邀请好友任务。

**架构：** 后端提供 REST API，负责奖品管理、抽奖执行（加权随机 + 保底机制）和任务完成追踪。前端是 UniApp 微信小程序，包含两个 tabbar（首页 + 我的）、九宫格抽奖组件、任务列表和个人中心页面。所有状态由服务端维护，前端仅负责展示。

**技术栈：** Node.js/Express 5 + MySQL 8 + Redis 7（后端），UniApp Vue 3 目标平台 mp-weixin（前端）

---

## 系统设计

### 数据库表结构

```
users（已有）
  ├── id, openid, session_key, nick_name, avatar_url, created_at, updated_at

prizes（新建）— 奖品表
  ├── id, name, description, image_url, type(physical/virtual/coupon/thanks)
  ├── weight（概率权重，如 100）
  ├── stock（剩余库存，NULL 表示不限量）
  ├── sort_order（在九宫格中的显示位置）
  ├── is_active（1=启用, 0=禁用）
  └── created_at, updated_at

pity_config（新建）— 保底配置表
  ├── id
  ├── pity_threshold（如 10 = 连续10次未中奖则必中）
  ├── pity_prize_id（外键 → prizes.id，保底触发时发放的奖品）
  └── created_at, updated_at

draw_records（新建）— 每次抽奖记录
  ├── id, user_id（外键 → users.id）, prize_id（外键 → prizes.id）
  ├── is_pity（是否为保底触发的中奖）
  └── created_at

user_daily_state（新建）— 用户每日状态
  ├── id, user_id, date（DATE 类型）
  ├── free_draws_used（今日已使用的免费次数）
  ├── total_draws（今日总抽奖次数，用于保底计数）
  ├── consecutive_losses（连续未中奖次数，中奖后归零）
  ├── ad_task_done（0/1 — 今日是否已看广告）
  ├── invite_task_done（0/1 — 今日邀请任务是否已完成）
  ├── ad_draws_earned（今日广告任务获得的抽奖次数）
  ├── invite_draws_earned（今日邀请任务获得的抽奖次数）
  └── UNIQUE(user_id, date)

invitations（新建）— 邀请关系追踪
  ├── id, inviter_id（外键 → users.id）, invitee_id（外键 → users.id）
  ├── created_at
  └── UNIQUE(invitee_id) — 每个人只能被邀请一次
```

### 接口列表

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/spin/home` | 需要 | 首页数据：奖品列表、用户每日状态、任务进度 |
| POST | `/api/spin/draw` | 需要 | 执行一次抽奖 |
| POST | `/api/spin/task/ad` | 需要 | 完成观看广告任务，获得1次抽奖机会 |
| POST | `/api/spin/task/invite` | 需要 | 记录一次邀请，满3人后获得3次抽奖机会 |
| GET | `/api/spin/records` | 需要 | 用户抽奖历史记录 |
| GET | `/api/auth/me` | 需要 | （已有）获取用户信息 |

### 奖品概率算法

1. 获取所有启用且有库存的奖品（`is_active = 1 AND (stock IS NULL OR stock > 0)`）。
2. 如果 `consecutive_losses >= pity_threshold`，则强制发放 `pity_prize_id` 对应的保底奖品，并重置计数器。
3. 否则，使用加权随机：`P(奖品i) = weight_i / 所有weight之和`。
4. 类型为 `thanks`（"谢谢参与"）的奖品计入"未中奖"，保底计数器 +1。
5. 抽奖后：如果 `stock` 不为 NULL，使用 `UPDATE ... WHERE stock > 0` 原子扣减库存（防并发）。

### 任务系统规则

- **基础**：每天1次免费抽奖（无需任务）。
- **任务1 — 观看广告**：必须先完成。完成后获得1次额外抽奖机会。调用 `POST /api/spin/task/ad`。
- **任务2 — 邀请3人**：只有任务1完成后才能解锁。每次有效邀请通过 `POST /api/spin/task/invite` 记录。当达到3个有效邀请后，获得3次额外抽奖机会。
- 任务每日重置。

### 前端页面

| 页面 | 路径 | 说明 |
|------|------|------|
| 首页 | `pages/index/index` | 九宫格抽奖 + 任务列表 + 用户头像 |
| 登录页 | `pages/login/login` | （已有）微信登录 |
| 个人中心 | `pages/my/my` | 用户信息 + 抽奖记录 |

---

## 文件结构

### 后端 — 新增文件

| 文件 | 职责 |
|------|------|
| `src/db/migrations/002_create_prizes.sql` | 创建 prizes + pity_config 表，含初始奖品和保底配置数据 |
| `src/db/migrations/003_create_draw_records.sql` | 创建 draw_records 表 |
| `src/db/migrations/004_create_user_daily_state.sql` | 创建 user_daily_state 表 |
| `src/db/migrations/005_create_invitations.sql` | 创建 invitations 表 |
| `src/services/spin.js` | 抽奖逻辑：加权随机、保底、库存扣减 |
| `src/services/task.js` | 任务完成逻辑：广告、邀请验证 |
| `src/routes/spin.js` | `/api/spin/*` 路由处理 |

### 后端 — 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/app.js` | 挂载 `spinRouter` |

### 前端 — 新增文件

| 文件 | 职责 |
|------|------|
| `pages/index/index.vue` | 首页：九宫格抽奖 + 任务列表 |
| `pages/my/my.vue` | 个人中心页面 |
| `components/lottery-grid.vue` | 3x3 九宫格抽奖动画组件 |
| `components/task-list.vue` | 任务卡片（广告 + 邀请） |
| `components/tab-bar.vue` | 自定义底部导航栏（首页 + 我的） |

### 前端 — 修改文件

| 文件 | 修改内容 |
|------|----------|
| `pages.json` | 添加首页、个人中心页面 + tabBar 配置 |
| `common/api.js` | 添加抽奖相关 API 函数 |

---

## 任务 1：数据库迁移 — prizes + pity_config 表

**文件：**
- 新建：`src/db/migrations/002_create_prizes.sql`

- [ ] **步骤 1：创建迁移文件**

```sql
CREATE TABLE IF NOT EXISTS prizes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) DEFAULT '' COMMENT '奖品描述',
  image_url VARCHAR(512) DEFAULT '',
  type ENUM('physical', 'virtual', 'coupon', 'thanks') NOT NULL DEFAULT 'thanks',
  weight INT UNSIGNED NOT NULL DEFAULT 100,
  stock INT DEFAULT NULL COMMENT 'NULL表示不限量',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_active_sort (is_active, sort_order)
);

CREATE TABLE IF NOT EXISTS pity_config (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pity_threshold INT UNSIGNED NOT NULL DEFAULT 10 COMMENT '连续未中奖N次后保底',
  pity_prize_id INT UNSIGNED NOT NULL COMMENT '外键指向prizes.id',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ========== 初始奖品数据（8个奖品填充九宫格） ==========
INSERT INTO prizes (name, description, image_url, type, weight, stock, sort_order, is_active) VALUES
('一等奖', '神秘大礼包一份', '', 'physical', 1, 5, 1, 1),
('二等奖', '精美周边礼品', '', 'virtual', 5, 20, 2, 1),
('三等奖', '限定虚拟道具', '', 'virtual', 15, 50, 3, 1),
('优惠券5元', '全场通用优惠券', '', 'coupon', 30, NULL, 4, 1),
('优惠券2元', '全场通用优惠券', '', 'coupon', 50, NULL, 5, 1),
('谢谢参与', '下次好运', '', 'thanks', 100, NULL, 6, 1),
('谢谢参与', '下次好运', '', 'thanks', 100, NULL, 7, 1),
('谢谢参与', '下次好运', '', 'thanks', 100, NULL, 8, 1);

-- ========== 保底配置：连续10次未中奖则必中三等奖 ==========
INSERT INTO pity_config (pity_threshold, pity_prize_id) VALUES (10, 3)
```

注意：`pity_prize_id = 3` 指向第三个奖品（三等奖）。如果奖品 ID 不同请相应调整。

- [ ] **步骤 2：验证迁移是否执行成功**

运行：`npm run dev`（需先启动 Docker 开发环境）
预期：日志显示 `Migration applied: 002_create_prizes.sql`，prizes 表有8条记录，pity_config 表有1条记录。

- [ ] **步骤 3：提交代码**

```bash
git add src/db/migrations/002_create_prizes.sql
git commit -m "feat: 新增 prizes 和 pity_config 表及初始配置数据"
```

---

## 任务 2：数据库迁移 — draw_records 表

**文件：**
- 新建：`src/db/migrations/003_create_draw_records.sql`

- [ ] **步骤 1：创建迁移文件**

```sql
CREATE TABLE IF NOT EXISTS draw_records (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  prize_id INT UNSIGNED NOT NULL,
  is_pity TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_created (user_id, created_at DESC),
  CONSTRAINT fk_draw_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_draw_prize FOREIGN KEY (prize_id) REFERENCES prizes(id)
)
```

- [ ] **步骤 2：验证迁移是否执行成功**

运行：`npm run dev`
预期：日志显示 `Migration applied: 003_create_draw_records.sql`

- [ ] **步骤 3：提交代码**

```bash
git add src/db/migrations/003_create_draw_records.sql
git commit -m "feat: 新增 draw_records 抽奖记录表"
```

---

## 任务 3：数据库迁移 — user_daily_state 表

**文件：**
- 新建：`src/db/migrations/004_create_user_daily_state.sql`

- [ ] **步骤 1：创建迁移文件**

```sql
CREATE TABLE IF NOT EXISTS user_daily_state (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  date DATE NOT NULL,
  free_draws_used INT UNSIGNED NOT NULL DEFAULT 0,
  total_draws INT UNSIGNED NOT NULL DEFAULT 0,
  consecutive_losses INT UNSIGNED NOT NULL DEFAULT 0,
  ad_task_done TINYINT(1) NOT NULL DEFAULT 0,
  invite_task_done TINYINT(1) NOT NULL DEFAULT 0,
  ad_draws_earned INT UNSIGNED NOT NULL DEFAULT 0,
  invite_draws_earned INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_date (user_id, date),
  CONSTRAINT fk_daily_user FOREIGN KEY (user_id) REFERENCES users(id)
)
```

- [ ] **步骤 2：验证迁移是否执行成功**

运行：`npm run dev`
预期：日志显示 `Migration applied: 004_create_user_daily_state.sql`

- [ ] **步骤 3：提交代码**

```bash
git add src/db/migrations/004_create_user_daily_state.sql
git commit -m "feat: 新增 user_daily_state 用户每日状态表"
```

---

## 任务 4：数据库迁移 — invitations 表

**文件：**
- 新建：`src/db/migrations/005_create_invitations.sql`

- [ ] **步骤 1：创建迁移文件**

```sql
CREATE TABLE IF NOT EXISTS invitations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inviter_id INT UNSIGNED NOT NULL,
  invitee_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_invitee (invitee_id),
  INDEX idx_inviter (inviter_id),
  CONSTRAINT fk_inv_inviter FOREIGN KEY (inviter_id) REFERENCES users(id),
  CONSTRAINT fk_inv_invitee FOREIGN KEY (invitee_id) REFERENCES users(id)
)
```

- [ ] **步骤 2：验证迁移是否执行成功**

运行：`npm run dev`
预期：日志显示 `Migration applied: 005_create_invitations.sql`

- [ ] **步骤 3：提交代码**

```bash
git add src/db/migrations/005_create_invitations.sql
git commit -m "feat: 新增 invitations 邀请关系表"
```

---

## 任务 5：后端服务 — 抽奖核心逻辑

**文件：**
- 新建：`src/services/spin.js`

- [ ] **步骤 1：创建抽奖服务**

```js
import { query } from '../libs/db.js';
import pool from '../libs/db.js';
import logger from '../utils/logger.js';

/**
 * 获取或创建用户今日的每日状态记录。
 * @param {number} userId
 * @returns {Promise<object>} user_daily_state 行
 */
export async function getOrCreateDailyState(userId) {
  const today = new Date().toISOString().slice(0, 10);

  await query(
    `INSERT IGNORE INTO user_daily_state (user_id, date) VALUES (?, ?)`,
    [userId, today]
  );

  const [state] = await query(
    `SELECT * FROM user_daily_state WHERE user_id = ? AND date = ?`,
    [userId, today]
  );

  return state;
}

/**
 * 计算用户今日剩余抽奖次数。
 */
export function getRemainingDraws(state) {
  const baseFree = 1;
  const totalEarned = baseFree + state.ad_draws_earned + state.invite_draws_earned;
  const used = state.free_draws_used;
  return Math.max(0, totalEarned - used);
}

/**
 * 获取所有启用且有库存的奖品（用于抽奖选择）。
 */
export async function getActivePrizes() {
  return query(
    `SELECT * FROM prizes WHERE is_active = 1 AND (stock IS NULL OR stock > 0) ORDER BY sort_order`
  );
}

/**
 * 获取所有启用的奖品（包括已无库存的，用于前端展示）。
 */
export async function getAllDisplayPrizes() {
  return query(`SELECT id, name, description, image_url, type, sort_order FROM prizes WHERE is_active = 1 ORDER BY sort_order`);
}

/**
 * 获取保底配置。
 */
export async function getPityConfig() {
  const [config] = await query(`SELECT * FROM pity_config LIMIT 1`);
  return config || null;
}

/**
 * 加权随机选择奖品。
 * @param {Array} prizes - 每个奖品必须包含 weight 属性
 * @returns {object} 被选中的奖品
 */
export function weightedRandom(prizes) {
  const totalWeight = prizes.reduce((sum, p) => sum + p.weight, 0);
  let random = Math.random() * totalWeight;

  for (const prize of prizes) {
    random -= prize.weight;
    if (random <= 0) {
      return prize;
    }
  }

  return prizes[prizes.length - 1];
}

/**
 * 执行一次抽奖。返回中奖的奖品。
 * 使用事务保证原子性。
 */
export async function executeDraw(userId) {
  const state = await getOrCreateDailyState(userId);
  const remaining = getRemainingDraws(state);

  if (remaining <= 0) {
    return { success: false, error: '今日抽奖次数已用完' };
  }

  const availablePrizes = await getActivePrizes();
  if (availablePrizes.length === 0) {
    return { success: false, error: '暂无可用奖品' };
  }

  const pityConfig = await getPityConfig();
  let selectedPrize;
  let isPity = false;

  // 检查保底系统
  if (pityConfig && state.consecutive_losses >= pityConfig.pity_threshold - 1) {
    // 本次抽奖触发保底 — 查找保底奖品
    const pityPrize = availablePrizes.find(p => p.id === pityConfig.pity_prize_id);
    if (pityPrize) {
      selectedPrize = pityPrize;
      isPity = true;
    }
  }

  // 保底未触发则使用加权随机
  if (!selectedPrize) {
    selectedPrize = weightedRandom(availablePrizes);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 如果奖品有库存限制，扣减库存
    if (selectedPrize.stock !== null) {
      const [result] = await conn.execute(
        `UPDATE prizes SET stock = stock - 1 WHERE id = ? AND stock > 0`,
        [selectedPrize.id]
      );
      if (result.affectedRows === 0) {
        // 库存在选择和扣减之间耗尽 — 回退为"谢谢参与"
        await conn.rollback();
        const thanksPrize = availablePrizes.find(p => p.type === 'thanks');
        if (thanksPrize) {
          selectedPrize = thanksPrize;
          isPity = false;
        } else {
          conn.release();
          return { success: false, error: '奖品已领完' };
        }
        // 重新开启事务处理回退奖品
        await conn.beginTransaction();
      }
    }

    // 记录本次抽奖
    await conn.execute(
      `INSERT INTO draw_records (user_id, prize_id, is_pity) VALUES (?, ?, ?)`,
      [userId, selectedPrize.id, isPity ? 1 : 0]
    );

    // 更新每日状态
    const isRealWin = selectedPrize.type !== 'thanks';
    const newConsecutiveLosses = isRealWin ? 0 : state.consecutive_losses + 1;

    await conn.execute(
      `UPDATE user_daily_state
       SET free_draws_used = free_draws_used + 1,
           total_draws = total_draws + 1,
           consecutive_losses = ?
       WHERE user_id = ? AND date = ?`,
      [newConsecutiveLosses, userId, new Date().toISOString().slice(0, 10)]
    );

    await conn.commit();

    return {
      success: true,
      data: {
        prize: {
          id: selectedPrize.id,
          name: selectedPrize.name,
          description: selectedPrize.description,
          imageUrl: selectedPrize.image_url,
          type: selectedPrize.type,
        },
        isPity,
      },
    };
  } catch (err) {
    await conn.rollback();
    logger.error({ err }, '抽奖事务执行失败');
    throw err;
  } finally {
    conn.release();
  }
}
```

- [ ] **步骤 2：提交代码**

```bash
git add src/services/spin.js
git commit -m "feat: 新增抽奖服务，支持加权随机和保底系统"
```

---

## 任务 6：后端服务 — 任务完成逻辑

**文件：**
- 新建：`src/services/task.js`

- [ ] **步骤 1：创建任务服务**

```js
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
 * @param {number} inviterId - 发出邀请的用户
 * @param {number} inviteeId - 接受邀请的新用户
 */
export async function recordInvitation(inviterId, inviteeId) {
  if (inviterId === inviteeId) {
    return { success: false, error: '不能邀请自己' };
  }

  const state = await getOrCreateDailyState(inviterId);

  // 任务2需要先完成任务1（广告）
  if (!state.ad_task_done) {
    return { success: false, error: '请先完成观看广告任务' };
  }

  if (state.invite_task_done) {
    return { success: false, error: '今日邀请任务已完成' };
  }

  // 检查被邀请人是否已被其他人邀请过
  const [existing] = await query(
    `SELECT id FROM invitations WHERE invitee_id = ?`,
    [inviteeId]
  );
  if (existing) {
    return { success: false, error: '该用户已被其他人邀请' };
  }

  // 记录邀请关系
  await query(
    `INSERT INTO invitations (inviter_id, invitee_id) VALUES (?, ?)`,
    [inviterId, inviteeId]
  );

  // 统计今日邀请人数
  const today = new Date().toISOString().slice(0, 10);
  const [countRow] = await query(
    `SELECT COUNT(*) AS cnt FROM invitations WHERE inviter_id = ? AND DATE(created_at) = ?`,
    [inviterId, today]
  );
  const todayCount = countRow.cnt;

  if (todayCount >= 3) {
    // 满3人，奖励3次抽奖机会并标记任务完成
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
  const today = new Date().toISOString().slice(0, 10);
  const [row] = await query(
    `SELECT COUNT(*) AS cnt FROM invitations WHERE inviter_id = ? AND DATE(created_at) = ?`,
    [userId, today]
  );
  return row.cnt;
}
```

- [ ] **步骤 2：提交代码**

```bash
git add src/services/task.js
git commit -m "feat: 新增任务服务，支持广告观看和邀请好友"
```

---

## 任务 7：后端路由 — 抽奖 API

**文件：**
- 新建：`src/routes/spin.js`
- 修改：`src/app.js`

- [ ] **步骤 1：创建抽奖路由**

```js
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
```

- [ ] **步骤 2：在 app.js 中挂载路由**

修改 `src/app.js`，添加以下两行：

```js
import spinRouter from './routes/spin.js';
```

在 `app.use(authRouter);` 之后添加：

```js
app.use(spinRouter);
```

修改后完整的 `src/app.js` 应为：

```js
import express from 'express';
import requestLogger from './middlewares/requestLogger.js';
import { notFoundHandler, errorHandler } from './middlewares/errorHandler.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import spinRouter from './routes/spin.js';

const app = express();

app.use(express.json());
app.use(requestLogger);

app.use(healthRouter);
app.use(authRouter);
app.use(spinRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
```

- [ ] **步骤 3：验证服务启动无报错**

运行：`npm run dev`
预期：服务正常启动，无导入错误。

- [ ] **步骤 4：提交代码**

```bash
git add src/routes/spin.js src/app.js
git commit -m "feat: 新增抽奖 API 路由"
```

---

## 任务 8：前端 — 更新 pages.json + API 层

> **必须先调用 `frontend-design` skill**

**文件：**
- 修改：`E:\poject\wei-gif\pages.json`
- 修改：`E:\poject\wei-gif\common\api.js`

- [ ] **步骤 1：更新 pages.json**

将 `E:\poject\wei-gif\pages.json` 整体替换为：

```json
{
  "pages": [
    {
      "path": "pages/index/index",
      "style": {
        "navigationStyle": "custom"
      }
    },
    {
      "path": "pages/my/my",
      "style": {
        "navigationStyle": "custom"
      }
    },
    {
      "path": "pages/login/login",
      "style": {
        "navigationStyle": "custom"
      }
    }
  ],
  "tabBar": {
    "color": "#7A6B5D",
    "selectedColor": "#D94E41",
    "backgroundColor": "#FBF7F2",
    "borderStyle": "white",
    "list": [
      {
        "pagePath": "pages/index/index",
        "text": "首页",
        "iconPath": "static/tab-home.png",
        "selectedIconPath": "static/tab-home-active.png"
      },
      {
        "pagePath": "pages/my/my",
        "text": "我的",
        "iconPath": "static/tab-my.png",
        "selectedIconPath": "static/tab-my-active.png"
      }
    ]
  },
  "globalStyle": {
    "navigationStyle": "custom",
    "navigationBarTextStyle": "black",
    "navigationBarTitleText": "",
    "navigationBarBackgroundColor": "#F5F0E8",
    "backgroundColor": "#F5F0E8"
  },
  "uniIdRouter": {}
}
```

注意：需要在 `static/` 目录下创建 tabBar 图标文件。使用 81x81px 的 PNG 图标：`tab-home.png`、`tab-home-active.png`、`tab-my.png`、`tab-my-active.png`。快速原型开发时可使用简单的占位图。

- [ ] **步骤 2：添加抽奖 API 函数到 api.js**

在 `E:\poject\wei-gif\common\api.js` 末尾添加以下函数，替换掉已有的即时抽奖部分（从 `// ==================== 即时抽奖 ====================` 到 `getSpinRecords`）：

```js
// ==================== 即时抽奖 ====================

/** GET /api/spin/home — 首页数据：奖品 + 状态 + 任务 */
export function getSpinHome() {
  return request('GET', '/api/spin/home')
}

/** POST /api/spin/draw — 执行一次抽奖 */
export function spinDraw() {
  return request('POST', '/api/spin/draw')
}

/** POST /api/spin/task/ad — 完成观看广告任务 */
export function completeAdTask() {
  return request('POST', '/api/spin/task/ad')
}

/** POST /api/spin/task/invite — 记录邀请 */
export function completeInviteTask(inviterId) {
  return request('POST', '/api/spin/task/invite', { inviterId })
}

/** GET /api/spin/records — 抽奖记录 */
export function getSpinRecords() {
  return request('GET', '/api/spin/records')
}
```

同时删除旧的参与式抽奖部分（从 `// ==================== 参与式抽奖 ====================` 到 `getMyLotteries`），该功能已不再使用。

- [ ] **步骤 3：提交代码**

```bash
cd E:/poject/wei-gif
git add pages.json common/api.js
git commit -m "feat: 更新页面配置，添加 tabBar 和抽奖 API 层"
```

---

## 任务 9：前端 — 自定义底部导航栏组件

> **必须先调用 `frontend-design` skill**

**文件：**
- 新建：`E:\poject\wei-gif\components\tab-bar.vue`

- [ ] **步骤 1：创建 tab-bar 组件**

```vue
<template>
  <view class="tab-bar">
    <view
      class="tab-item"
      v-for="item in tabs"
      :key="item.path"
      :class="{ active: currentPath === item.path }"
      @click="switchTab(item.path)"
    >
      <text class="tab-icon">{{ item.icon }}</text>
      <text class="tab-label">{{ item.label }}</text>
    </view>
  </view>
  <view class="tab-bar-placeholder"></view>
</template>

<script>
export default {
  props: {
    currentPath: { type: String, default: '' }
  },
  data() {
    return {
      tabs: [
        { path: '/pages/index/index', label: '首页', icon: '🏠' },
        { path: '/pages/my/my', label: '我的', icon: '👤' }
      ]
    }
  },
  methods: {
    switchTab(path) {
      if (this.currentPath === path) return
      uni.switchTab({ url: path })
    }
  }
}
</script>

<style lang="scss" scoped>
.tab-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 100rpx;
  background: $koi-card;
  display: flex;
  align-items: center;
  justify-content: space-around;
  box-shadow: 0 -2rpx 16rpx rgba(45, 31, 20, 0.06);
  padding-bottom: env(safe-area-inset-bottom);
  z-index: 999;
}

.tab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
  flex: 1;
}

.tab-icon {
  font-size: 40rpx;
}

.tab-label {
  font-size: 20rpx;
  color: $koi-text-sub;
}

.tab-item.active .tab-label {
  color: $koi-red;
  font-weight: 600;
}

.tab-bar-placeholder {
  height: calc(100rpx + env(safe-area-inset-bottom));
}
</style>
```

- [ ] **步骤 2：提交代码**

```bash
cd E:/poject/wei-gif
git add components/tab-bar.vue
git commit -m "feat: 新增自定义底部导航栏组件"
```

---

## 任务 10：前端 — 九宫格抽奖组件

> **必须先调用 `frontend-design` skill**

**文件：**
- 新建：`E:\poject\wei-gif\components\lottery-grid.vue`

- [ ] **步骤 1：创建九宫格抽奖组件**

这是一个 3x3 九宫格，其中8个格子展示奖品，中心格子为"抽奖"按钮。动画效果为依次高亮格子，最终停在中奖奖品上。

```vue
<template>
  <view class="grid-wrap">
    <view class="grid">
      <view
        v-for="(cell, idx) in cells"
        :key="idx"
        class="cell"
        :class="{
          active: highlightIndex === idx,
          center: idx === 4,
          won: wonIndex === idx
        }"
        @click="idx === 4 && $emit('draw')"
      >
        <template v-if="idx === 4">
          <text class="draw-text">{{ spinning ? '...' : '抽奖' }}</text>
          <text class="draw-sub" v-if="!spinning">剩余 {{ remainingDraws }} 次</text>
        </template>
        <template v-else>
          <image v-if="cell.imageUrl" class="prize-img" :src="cell.imageUrl" mode="aspectFit" />
          <text class="prize-icon" v-else>🎁</text>
          <text class="prize-name">{{ cell.name }}</text>
          <text class="prize-desc" v-if="cell.description">{{ cell.description }}</text>
        </template>
      </view>
    </view>
  </view>
</template>

<script>
// 九宫格位置映射：从左上角顺时针排列
// 视觉布局：0  1  2
//           3  4  5
//           6  7  8
// 奖品数组索引(0-7)按顺时针映射到九宫格位置：
const GRID_POSITIONS = [0, 1, 2, 5, 8, 7, 6, 3]
// 旋转顺序（顺时针）：九宫格位置 0→1→2→5→8→7→6→3→0→...
const SPIN_SEQUENCE = [0, 1, 2, 5, 8, 7, 6, 3]
const SEQ_LEN = SPIN_SEQUENCE.length // 8

export default {
  props: {
    prizes: { type: Array, default: () => [] },
    remainingDraws: { type: Number, default: 0 },
    spinning: { type: Boolean, default: false },
    result: { type: Object, default: null }
  },
  data() {
    return {
      highlightIndex: -1,
      wonIndex: -1,
      spinTimer: null,
      // 共享步进计数器，整个动画生命周期不重置，避免跳跃
      currentStep: 0,
      // 停止阶段的状态
      stopping: false,
      totalSteps: 0,   // 停止阶段要走的总步数
      stoppedStep: 0    // 停止阶段已走的步数
    }
  },
  computed: {
    cells() {
      // 构建9格数组：8个奖品 + 中心按钮
      const grid = new Array(9).fill(null)
      const prizes = this.prizes || []
      for (let i = 0; i < 8 && i < prizes.length; i++) {
        grid[GRID_POSITIONS[i]] = prizes[i]
      }
      // 填充空格
      for (let i = 0; i < 9; i++) {
        if (!grid[i]) grid[i] = { name: '', imageUrl: '' }
      }
      return grid
    }
  },
  watch: {
    spinning(val) {
      if (val) {
        this.startSpin()
      }
    },
    result(val) {
      if (val && this.spinning && !this.stopping) {
        this.beginStopping(val)
      }
    }
  },
  methods: {
    startSpin() {
      this.wonIndex = -1
      this.stopping = false
      this.currentStep = 0

      this.tick()
    },

    /** 匀速旋转阶段：固定速度循环，直到 beginStopping 接管 */
    tick() {
      const seqIdx = this.currentStep % SEQ_LEN
      this.highlightIndex = SPIN_SEQUENCE[seqIdx]
      this.currentStep++

      if (!this.stopping) {
        this.spinTimer = setTimeout(() => this.tick(), 80)
      }
    },

    /**
     * 收到结果后，从当前位置开始减速，精确停在目标格。
     * 核心思路：
     *  1. 算出目标在序列中的索引 targetSeqIdx
     *  2. 算出从"当前位置"再多转 extraLaps 整圈后到达目标需要几步 (totalSteps)
     *  3. 逐步减速播放这些步，最后一步一定落在目标上
     */
    beginStopping(result) {
      this.stopping = true
      clearTimeout(this.spinTimer)

      // 找到中奖奖品在 SPIN_SEQUENCE 中的序列索引
      const prizeIndex = this.prizes.findIndex(p => p.id === result.prize.id)
      const targetSeqIdx = prizeIndex >= 0 ? prizeIndex : 0

      // 当前序列位置
      const currentSeqIdx = (this.currentStep - 1) % SEQ_LEN

      // 计算从当前位置到目标需要几步（同一圈内）
      let stepsToTarget = targetSeqIdx - currentSeqIdx
      if (stepsToTarget <= 0) {
        stepsToTarget += SEQ_LEN  // 保证至少走到下一次经过目标
      }

      // 额外多转3整圈，让动画有足够的减速空间
      const extraLaps = 3
      this.totalSteps = extraLaps * SEQ_LEN + stepsToTarget
      this.stoppedStep = 0

      this.decelerate()
    },

    /** 减速阶段：用缓出函数计算每步延时，保证逐步变慢、精确到达 */
    decelerate() {
      const seqIdx = this.currentStep % SEQ_LEN
      this.highlightIndex = SPIN_SEQUENCE[seqIdx]
      this.currentStep++
      this.stoppedStep++

      // 到达预定终点 → 停止
      if (this.stoppedStep >= this.totalSteps) {
        this.wonIndex = this.highlightIndex
        this.$emit('spin-end')
        return
      }

      // 缓出减速：progress 0→1，delay 从 60ms 渐增到 350ms
      const progress = this.stoppedStep / this.totalSteps
      const eased = progress * progress  // 二次缓出，后半段明显变慢
      const delay = 60 + eased * 290

      this.spinTimer = setTimeout(() => this.decelerate(), delay)
    }
  },
  beforeUnmount() {
    clearTimeout(this.spinTimer)
  }
}
</script>

<style lang="scss" scoped>
.grid-wrap {
  padding: 0 24rpx;
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12rpx;
  background: $koi-gradient-red;
  padding: 16rpx;
  border-radius: $koi-radius-lg;
}

.cell {
  aspect-ratio: 1;
  background: $koi-card;
  border-radius: $koi-radius;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  transition: all 0.1s;
  position: relative;
  overflow: hidden;
}

.cell.active {
  background: $koi-gold-light;
  box-shadow: 0 0 16rpx rgba(200, 152, 44, 0.5);
}

.cell.won {
  background: $koi-gold-light;
  animation: pulse 0.5s ease-in-out 3;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

.cell.center {
  background: $koi-gradient-red;
  cursor: pointer;
}

.draw-text {
  font-size: 36rpx;
  font-weight: 700;
  color: #FFFFFF;
  letter-spacing: 4rpx;
}

.draw-sub {
  font-size: 20rpx;
  color: rgba(255, 255, 255, 0.8);
}

.prize-img {
  width: 80rpx;
  height: 80rpx;
}

.prize-icon {
  font-size: 48rpx;
}

.prize-name {
  font-size: 22rpx;
  color: $koi-text;
  text-align: center;
  max-width: 90%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prize-desc {
  font-size: 18rpx;
  color: $koi-text-hint;
  text-align: center;
  max-width: 90%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
```

- [ ] **步骤 2：提交代码**

```bash
cd E:/poject/wei-gif
git add components/lottery-grid.vue
git commit -m "feat: 新增九宫格抽奖组件，含旋转动画"
```

---

## 任务 11：前端 — 任务列表组件

> **必须先调用 `frontend-design` skill**

**文件：**
- 新建：`E:\poject\wei-gif\components\task-list.vue`

- [ ] **步骤 1：创建任务列表组件**

```vue
<template>
  <view class="task-section">
    <text class="section-title">做任务 赢机会</text>

    <!-- 任务1：观看广告 -->
    <view class="task-card" :class="{ done: tasks.ad.done }">
      <view class="task-info">
        <text class="task-icon">📺</text>
        <view class="task-detail">
          <text class="task-name">观看激励广告</text>
          <text class="task-reward">+1 抽奖机会</text>
        </view>
      </view>
      <view
        class="task-btn"
        :class="{ disabled: tasks.ad.done }"
        @click="!tasks.ad.done && $emit('do-ad')"
      >
        <text class="task-btn-text">{{ tasks.ad.done ? '已完成' : '去观看' }}</text>
      </view>
    </view>

    <!-- 任务2：邀请好友 -->
    <view class="task-card" :class="{ done: tasks.invite.done, locked: tasks.invite.locked }">
      <view class="task-info">
        <text class="task-icon">{{ tasks.invite.locked ? '🔒' : '👥' }}</text>
        <view class="task-detail">
          <text class="task-name">邀请好友</text>
          <text class="task-reward">邀请3人 +3 抽奖机会</text>
          <text class="task-progress" v-if="!tasks.invite.locked && !tasks.invite.done">
            已邀请 {{ tasks.invite.todayInvites }}/{{ tasks.invite.requiredInvites }} 人
          </text>
          <text class="task-lock-hint" v-if="tasks.invite.locked">
            完成广告任务后解锁
          </text>
        </view>
      </view>
      <button
        class="task-btn share-btn"
        :class="{ disabled: tasks.invite.locked || tasks.invite.done }"
        open-type="share"
        v-if="!tasks.invite.locked && !tasks.invite.done"
      >
        <text class="task-btn-text">去邀请</text>
      </button>
      <view class="task-btn disabled" v-else>
        <text class="task-btn-text">{{ tasks.invite.done ? '已完成' : '未解锁' }}</text>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  props: {
    tasks: {
      type: Object,
      default: () => ({
        ad: { done: false, drawsEarned: 0 },
        invite: { done: false, locked: true, todayInvites: 0, requiredInvites: 3, drawsEarned: 0 }
      })
    }
  }
}
</script>

<style lang="scss" scoped>
.task-section {
  padding: 32rpx 24rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: 700;
  color: $koi-text;
  margin-bottom: 24rpx;
  display: block;
}

.task-card {
  background: $koi-card;
  border-radius: $koi-radius;
  padding: 28rpx 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
  box-shadow: $koi-card-shadow;
}

.task-card.done {
  opacity: 0.6;
}

.task-card.locked {
  opacity: 0.5;
}

.task-info {
  display: flex;
  align-items: center;
  gap: 20rpx;
  flex: 1;
}

.task-icon {
  font-size: 48rpx;
}

.task-detail {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.task-name {
  font-size: 28rpx;
  font-weight: 600;
  color: $koi-text;
}

.task-reward {
  font-size: 22rpx;
  color: $koi-red;
}

.task-progress {
  font-size: 22rpx;
  color: $koi-text-sub;
}

.task-lock-hint {
  font-size: 22rpx;
  color: $koi-text-hint;
}

.task-btn {
  min-width: 120rpx;
  height: 56rpx;
  border-radius: 28rpx;
  background: $koi-gradient-red;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 24rpx;
}

.task-btn.disabled {
  background: $koi-bg-warm;
}

.task-btn-text {
  font-size: 24rpx;
  color: #FFFFFF;
  font-weight: 600;
}

.task-btn.disabled .task-btn-text {
  color: $koi-text-hint;
}

.share-btn {
  padding: 0;
  margin: 0;
  border: none;
  line-height: normal;
  &::after { border: none; }
}
</style>
```

- [ ] **步骤 2：提交代码**

```bash
cd E:/poject/wei-gif
git add components/task-list.vue
git commit -m "feat: 新增任务列表组件，支持广告和邀请任务"
```

---

## 任务 12：前端 — 首页

> **必须先调用 `frontend-design` skill**

**文件：**
- 新建：`E:\poject\wei-gif\pages\index\index.vue`

- [ ] **步骤 1：创建首页**

```vue
<template>
  <view class="page">
    <nav-bar title="幸运抽奖" />

    <!-- 用户头像（左上角） -->
    <view class="user-bar" @click="goToMy">
      <image
        class="user-avatar"
        :src="userInfo.avatarUrl || '/static/default-avatar.png'"
        mode="aspectFill"
      />
      <text class="user-name">{{ userInfo.nickName || '未登录' }}</text>
    </view>

    <!-- 九宫格抽奖 -->
    <lottery-grid
      :prizes="prizes"
      :remaining-draws="remainingDraws"
      :spinning="spinning"
      :result="drawResult"
      @draw="handleDraw"
      @spin-end="onSpinEnd"
    />

    <!-- 任务列表 -->
    <task-list
      :tasks="tasks"
      @do-ad="handleAdTask"
    />
  </view>
</template>

<script>
import navBar from '@/components/nav-bar.vue'
import lotteryGrid from '@/components/lottery-grid.vue'
import taskList from '@/components/task-list.vue'
import { getSpinHome, spinDraw, completeAdTask, isLoggedIn, getLocalUserInfo } from '@/common/api.js'

export default {
  components: { navBar, lotteryGrid, taskList },
  data() {
    return {
      prizes: [],
      remainingDraws: 0,
      tasks: {
        ad: { done: false, drawsEarned: 0 },
        invite: { done: false, locked: true, todayInvites: 0, requiredInvites: 3, drawsEarned: 0 }
      },
      userInfo: { nickName: '', avatarUrl: '' },
      spinning: false,
      drawResult: null
    }
  },
  onShow() {
    this.userInfo = getLocalUserInfo()
    if (isLoggedIn()) {
      this.loadData()
    }
  },
  onShareAppMessage() {
    // 分享时携带邀请人ID，用于邀请追踪
    const userId = uni.getStorageSync('userId') || ''
    return {
      title: '快来试试手气！',
      path: `/pages/index/index?inviterId=${userId}`
    }
  },
  onLoad(options) {
    // 处理邀请链接
    if (options.inviterId) {
      uni.setStorageSync('pendingInviterId', options.inviterId)
    }
  },
  methods: {
    async loadData() {
      try {
        const res = await getSpinHome()
        if (res.success) {
          this.prizes = res.data.prizes
          this.remainingDraws = res.data.remainingDraws
          this.tasks = res.data.tasks
        }
      } catch (err) {
        uni.showToast({ title: '加载失败', icon: 'none' })
      }
    },
    async handleDraw() {
      if (!isLoggedIn()) {
        uni.navigateTo({ url: '/pages/login/login' })
        return
      }
      if (this.spinning || this.remainingDraws <= 0) {
        if (this.remainingDraws <= 0) {
          uni.showToast({ title: '今日抽奖次数已用完，完成任务可获取更多机会', icon: 'none' })
        }
        return
      }

      this.spinning = true
      this.drawResult = null

      try {
        const res = await spinDraw()
        if (res.success) {
          this.drawResult = res.data
        } else {
          this.spinning = false
          uni.showToast({ title: res.error || '抽奖失败', icon: 'none' })
        }
      } catch (err) {
        this.spinning = false
        uni.showToast({ title: '网络错误', icon: 'none' })
      }
    },
    onSpinEnd() {
      this.spinning = false
      const prize = this.drawResult?.prize
      if (prize) {
        const isWin = prize.type !== 'thanks'
        uni.showModal({
          title: isWin ? '恭喜中奖！' : '谢谢参与',
          content: isWin ? `获得: ${prize.name}\n${prize.description || ''}` : '再接再厉，好运就在下一次！',
          showCancel: false
        })
      }
      // 刷新数据
      this.loadData()
    },
    async handleAdTask() {
      if (!isLoggedIn()) {
        uni.navigateTo({ url: '/pages/login/login' })
        return
      }

      // 播放激励视频广告
      // #ifdef MP-WEIXIN
      const adUnitId = '' // 在这里填入你的广告单元ID
      if (adUnitId) {
        let ad = null
        try {
          ad = wx.createRewardedVideoAd({ adUnitId })
          ad.onClose(async (res) => {
            if (res && res.isEnded) {
              await this.submitAdTask()
            } else {
              uni.showToast({ title: '请观看完整广告', icon: 'none' })
            }
          })
          await ad.show()
          return
        } catch (err) {
          // 广告加载失败，开发测试时允许直接完成
        }
      }
      // #endif

      // 兜底：直接完成（用于开发测试或广告未配置时）
      await this.submitAdTask()
    },
    async submitAdTask() {
      try {
        const res = await completeAdTask()
        if (res.success) {
          uni.showToast({ title: res.data.message, icon: 'none' })
          this.loadData()
        } else {
          uni.showToast({ title: res.error, icon: 'none' })
        }
      } catch (err) {
        uni.showToast({ title: '操作失败', icon: 'none' })
      }
    },
    goToMy() {
      uni.switchTab({ url: '/pages/my/my' })
    }
  }
}
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: $koi-bg;
  padding-bottom: calc(120rpx + env(safe-area-inset-bottom));
}

.user-bar {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 16rpx 32rpx;
}

.user-avatar {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  border: 2rpx solid $koi-border;
}

.user-name {
  font-size: 26rpx;
  color: $koi-text-sub;
}
</style>
```

- [ ] **步骤 2：提交代码**

```bash
cd E:/poject/wei-gif
git add pages/index/index.vue
git commit -m "feat: 新增首页，含九宫格抽奖和任务列表"
```

---

## 任务 13：前端 — 个人中心页面

> **必须先调用 `frontend-design` skill**

**文件：**
- 新建：`E:\poject\wei-gif\pages\my\my.vue`

- [ ] **步骤 1：创建个人中心页面**

```vue
<template>
  <view class="page">
    <nav-bar title="个人中心" />

    <!-- 用户信息卡片 -->
    <view class="profile-card">
      <image
        class="avatar"
        :src="userInfo.avatarUrl || '/static/default-avatar.png'"
        mode="aspectFill"
      />
      <view class="profile-info">
        <text class="nick-name">{{ userInfo.nickName || '未登录' }}</text>
        <text class="join-date" v-if="userInfo.createdAt">{{ formatDate(userInfo.createdAt) }} 加入</text>
      </view>
      <view class="login-btn" v-if="!loggedIn" @click="goLogin">
        <text class="login-btn-text">去登录</text>
      </view>
    </view>

    <!-- 抽奖记录 -->
    <view class="section">
      <text class="section-title">抽奖记录</text>
      <view v-if="records.length === 0" class="empty">
        <text class="empty-text">暂无抽奖记录</text>
      </view>
      <view class="record-card" v-for="record in records" :key="record.id">
        <view class="record-left">
          <text class="record-icon">{{ record.prize.type === 'thanks' ? '😅' : '🎁' }}</text>
          <view class="record-info">
            <text class="record-name">{{ record.prize.name }}</text>
            <text class="record-desc" v-if="record.prize.description">{{ record.prize.description }}</text>
            <text class="record-time">{{ formatTime(record.createdAt) }}</text>
          </view>
        </view>
        <text class="record-tag" :class="record.prize.type">
          {{ getTypeLabel(record.prize.type) }}
        </text>
      </view>
    </view>
  </view>
</template>

<script>
import navBar from '@/components/nav-bar.vue'
import { getSpinRecords, isLoggedIn, getLocalUserInfo } from '@/common/api.js'

export default {
  components: { navBar },
  data() {
    return {
      loggedIn: false,
      userInfo: { nickName: '', avatarUrl: '', createdAt: '' },
      records: []
    }
  },
  onShow() {
    this.loggedIn = isLoggedIn()
    this.userInfo = getLocalUserInfo()
    if (this.loggedIn) {
      this.loadRecords()
    }
  },
  methods: {
    async loadRecords() {
      try {
        const res = await getSpinRecords()
        if (res.success) {
          this.records = res.data
        }
      } catch (err) {
        uni.showToast({ title: '加载失败', icon: 'none' })
      }
    },
    goLogin() {
      uni.navigateTo({ url: '/pages/login/login' })
    },
    formatDate(str) {
      if (!str) return ''
      return new Date(str).toLocaleDateString('zh-CN')
    },
    formatTime(str) {
      if (!str) return ''
      const d = new Date(str)
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const hour = String(d.getHours()).padStart(2, '0')
      const min = String(d.getMinutes()).padStart(2, '0')
      return `${month}-${day} ${hour}:${min}`
    },
    getTypeLabel(type) {
      const labels = { physical: '实物', virtual: '虚拟', coupon: '优惠券', thanks: '未中奖' }
      return labels[type] || type
    }
  }
}
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: $koi-bg;
  padding-bottom: calc(120rpx + env(safe-area-inset-bottom));
}

.profile-card {
  margin: 24rpx;
  padding: 32rpx;
  background: $koi-card;
  border-radius: $koi-radius-lg;
  display: flex;
  align-items: center;
  gap: 24rpx;
  box-shadow: $koi-card-shadow;
}

.avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  border: 4rpx solid $koi-gold;
}

.profile-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.nick-name {
  font-size: 32rpx;
  font-weight: 700;
  color: $koi-text;
}

.join-date {
  font-size: 22rpx;
  color: $koi-text-hint;
}

.login-btn {
  padding: 12rpx 32rpx;
  background: $koi-gradient-red;
  border-radius: 32rpx;
}

.login-btn-text {
  font-size: 26rpx;
  color: #FFFFFF;
  font-weight: 600;
}

.section {
  padding: 0 24rpx;
  margin-top: 16rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: 700;
  color: $koi-text;
  margin-bottom: 24rpx;
  display: block;
}

.empty {
  padding: 64rpx 0;
  text-align: center;
}

.empty-text {
  font-size: 26rpx;
  color: $koi-text-hint;
}

.record-card {
  background: $koi-card;
  border-radius: $koi-radius;
  padding: 24rpx;
  margin-bottom: 16rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: $koi-card-shadow;
}

.record-left {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.record-icon {
  font-size: 40rpx;
}

.record-info {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.record-name {
  font-size: 28rpx;
  color: $koi-text;
  font-weight: 600;
}

.record-desc {
  font-size: 22rpx;
  color: $koi-text-sub;
}

.record-time {
  font-size: 22rpx;
  color: $koi-text-hint;
}

.record-tag {
  font-size: 22rpx;
  padding: 4rpx 16rpx;
  border-radius: 16rpx;
  background: $koi-bg-warm;
  color: $koi-text-sub;
}

.record-tag.physical,
.record-tag.virtual {
  background: $koi-red-light;
  color: $koi-red;
}

.record-tag.coupon {
  background: rgba(200, 152, 44, 0.1);
  color: $koi-gold;
}
</style>
```

- [ ] **步骤 2：提交代码**

```bash
cd E:/poject/wei-gif
git add pages/my/my.vue
git commit -m "feat: 新增个人中心页面，含抽奖记录"
```

---

## 任务 14：前端 — 更新登录页面，存储 userId

> **必须先调用 `frontend-design` skill**

**文件：**
- 修改：`E:\poject\wei-gif\pages\login\login.vue`

- [ ] **步骤 1：更新登录成功回调，存储 userId 并处理待处理的邀请**

在 `E:\poject\wei-gif\pages\login\login.vue` 中，找到 `handleLogin` 方法里的这段代码：

```js
if (res.success) {
  uni.setStorageSync('token', res.data.token)
  uni.setStorageSync('nickName', nickName)
  uni.setStorageSync('avatarUrl', avatarUrl)
  uni.showToast({ title: '登录成功', icon: 'none' })
  setTimeout(() => this.goBack(), 500)
}
```

替换为：

```js
if (res.success) {
  uni.setStorageSync('token', res.data.token)
  uni.setStorageSync('userId', res.data.user.id)
  uni.setStorageSync('nickName', nickName)
  uni.setStorageSync('avatarUrl', avatarUrl)
  // 处理待处理的邀请关系
  const pendingInviterId = uni.getStorageSync('pendingInviterId')
  if (pendingInviterId && Number(pendingInviterId) !== res.data.user.id) {
    try {
      const { completeInviteTask } = require('@/common/api.js')
      await completeInviteTask(pendingInviterId)
    } catch (e) { /* 忽略邀请相关错误 */ }
    uni.removeStorageSync('pendingInviterId')
  }
  uni.showToast({ title: '登录成功', icon: 'none' })
  setTimeout(() => this.goBack(), 500)
}
```

- [ ] **步骤 2：提交代码**

```bash
cd E:/poject/wei-gif
git add pages/login/login.vue
git commit -m "feat: 登录时存储 userId 并处理待处理的邀请"
```

---

## 任务 15：集成测试 — 完整流程验证

- [ ] **步骤 1：启动后端服务**

```bash
cd E:/poject/wei-gif-backend
npm run docker:dev
```

验证：所有迁移（002 到 005）执行成功，prizes 表有8条初始记录，服务运行在 3000 端口。

- [ ] **步骤 2：测试 GET /api/spin/home**

使用登录获取的有效 token 发起请求：

```bash
curl -H "Authorization: Bearer <token>" https://api1.cancanget.xyz/api/spin/home
```

预期响应结构：
```json
{
  "success": true,
  "data": {
    "prizes": ["...共8个奖品"],
    "remainingDraws": 1,
    "tasks": {
      "ad": { "done": false, "drawsEarned": 0 },
      "invite": { "done": false, "locked": true, "todayInvites": 0, "requiredInvites": 3, "drawsEarned": 0 }
    }
  }
}
```

- [ ] **步骤 3：测试 POST /api/spin/draw**

```bash
curl -X POST -H "Authorization: Bearer <token>" https://api1.cancanget.xyz/api/spin/draw
```

预期：返回一个奖品。第二次抽奖应返回错误"今日抽奖次数已用完"。

- [ ] **步骤 4：测试 POST /api/spin/task/ad**

```bash
curl -X POST -H "Authorization: Bearer <token>" https://api1.cancanget.xyz/api/spin/task/ad
```

预期：`{ "success": true, "data": { "drawsEarned": 1, "message": "..." } }`
此后 `GET /api/spin/home` 应显示 `remainingDraws: 1`（广告任务获得的新抽奖次数）。

- [ ] **步骤 5：在微信开发者工具中测试前端**

通过 HBuilderX → 运行 → 运行到小程序模拟器 → 微信开发者工具 启动前端。

验证以下功能：
1. 首页展示 3x3 九宫格，包含8个奖品
2. 中心"抽奖"按钮可点击，旋转动画正常播放
3. 任务列表显示广告任务和锁定的邀请任务
4. 完成广告任务后，邀请任务解锁
5. 底部 Tab 栏可在首页和个人中心之间切换
6. 个人中心页面展示抽奖记录

- [ ] **步骤 6：提交修复（如有）**

```bash
git add -A
git commit -m "fix: 集成测试修复"
```

---

## TabBar 图标说明

`pages.json` 中的 tabBar 配置引用了以下图标文件，需要手动创建：
- `static/tab-home.png`（81x81px，线框首页图标，颜色 #7A6B5D）
- `static/tab-home-active.png`（81x81px，填充首页图标，颜色 #D94E41）
- `static/tab-my.png`（81x81px，线框用户图标，颜色 #7A6B5D）
- `static/tab-my-active.png`（81x81px，填充用户图标，颜色 #D94E41）

这些应该是简单的 PNG 图标。可以从 iconfont.cn 下载或使用设计工具创建。

替代方案：如果不想准备图标文件，可以使用任务10中的自定义 `tab-bar.vue` 组件（基于 emoji）替代原生 tabBar。做法是删除 `pages.json` 中的 `tabBar` 配置，在每个 tab 页面中引入 `<tab-bar />` 组件。

# 即时抽奖（转盘/九宫格）设计文档

## 概述

新增即时抽奖玩法，支持转盘和九宫格两种展示形式。用户每次抽奖即时出结果，支持多奖品概率配置、库存管理、多来源免费次数系统。与现有参与式抽奖（join → wait → draw）完全独立。

## 核心特性

- 可配置奖品列表、概率、库存
- 支持 wheel（转盘）和 grid（九宫格）两种展示类型，按活动配置
- 免费次数多来源叠加：基础（base）+ 签到（checkin）+ 分享（share）
- 用完免费次数只能通过完成任务获取更多（无付费）
- 实物奖品有库存限制，虚拟/优惠券无限
- 库存耗尽的奖品概率归入"谢谢参与"

## 数据库设计

### spin_activities 即时抽奖活动表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT UNSIGNED PK AUTO_INCREMENT | 活动 ID |
| title | VARCHAR(128) | 活动标题 |
| description | TEXT | 活动描述 |
| display_type | ENUM('wheel','grid') | 展示类型：转盘 / 九宫格 |
| start_at | DATETIME | 活动开始时间 |
| end_at | DATETIME | 活动结束时间 |
| status | ENUM('active','ended','cancelled') NOT NULL DEFAULT 'active' | 活动状态 |
| created_at | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | |
| updated_at | TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | |

**索引**：`INDEX idx_status_time (status, start_at, end_at)`

### spin_prizes 活动奖品配置表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT UNSIGNED PK AUTO_INCREMENT | |
| activity_id | INT UNSIGNED | 关联活动 |
| name | VARCHAR(128) | 奖品名称 |
| type | VARCHAR(64) | physical / virtual / coupon / none（谢谢参与） |
| image_url | VARCHAR(512) NULL | 奖品图片 |
| probability | DECIMAL(8,5) NOT NULL | 中奖概率（如 0.05000 = 5%） |
| stock | INT NULL | 库存数量，NULL 表示无限 |
| sort_order | INT UNSIGNED DEFAULT 0 | 在转盘/九宫格中的显示顺序 |
| created_at | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | |

**约束**：同一活动所有奖品的 probability 之和 = 1.00000

**规则**：
- `type = 'none'` 代表"谢谢参与"，stock 固定为 NULL（无限）
- 实物奖品（physical）必须设置 stock
- 虚拟奖品（virtual）和优惠券（coupon）stock = NULL（无限）

### spin_free_config 免费次数配置表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT UNSIGNED PK AUTO_INCREMENT | |
| activity_id | INT UNSIGNED | 关联活动 |
| source | ENUM('base','checkin','share') | 来源类型 |
| daily_limit | INT UNSIGNED NOT NULL | 每日可获得次数 |
| created_at | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | |

**约束**：`UNIQUE(activity_id, source)` — 每个活动每种来源只有一条配置

**含义**：
- `base`：每日基础免费次数（无需任何操作即可使用）
- `checkin`：每日签到可额外获得的次数
- `share`：每次分享可额外获得的次数（每日上限为 daily_limit）

### spin_records 抽奖记录表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT UNSIGNED PK AUTO_INCREMENT | |
| activity_id | INT UNSIGNED | 关联活动 |
| user_id | INT UNSIGNED | 用户 |
| prize_id | INT UNSIGNED | 抽中的奖品 |
| source | ENUM('base','checkin','share') | 本次消耗的来源 |
| created_at | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | 抽奖时间 |

**索引**：`INDEX idx_user_activity_date (user_id, activity_id, created_at)` — 加速当日次数统计

### spin_task_records 任务完成记录表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT UNSIGNED PK AUTO_INCREMENT | |
| activity_id | INT UNSIGNED | 关联活动 |
| user_id | INT UNSIGNED | 用户 |
| task_type | ENUM('checkin','share') | 任务类型 |
| created_at | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | 完成时间 |

**约束**：签到每日一次通过应用层 + 查询 `DATE(created_at) = CURDATE()` 控制；分享可多次，通过 daily_limit 控制上限。

## API 设计

所有接口前缀 `/api/spin`。

### GET /api/spin/list

获取所有可参与的即时抽奖活动列表（optionalAuth）。

**响应**：
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "夏日转盘",
      "description": "...",
      "displayType": "wheel",
      "startAt": "2026-06-12T00:00:00.000Z",
      "endAt": "2026-06-30T23:59:59.000Z",
      "status": "active"
    }
  ]
}
```

### GET /api/spin/:id

获取活动详情 + 奖品列表 + 用户剩余次数（optionalAuth）。

**响应**：
```json
{
  "success": true,
  "data": {
    "id": 1,
    "title": "夏日转盘",
    "displayType": "wheel",
    "startAt": "...",
    "endAt": "...",
    "status": "active",
    "prizes": [
      { "id": 1, "name": "iPhone", "type": "physical", "imageUrl": "...", "sortOrder": 0 },
      { "id": 2, "name": "优惠券", "type": "coupon", "imageUrl": "...", "sortOrder": 1 },
      { "id": 3, "name": "谢谢参与", "type": "none", "imageUrl": null, "sortOrder": 2 }
    ],
    "remainingDraws": 3,
    "drawSources": {
      "base": { "used": 1, "limit": 3 },
      "checkin": { "used": 0, "limit": 1, "done": false },
      "share": { "used": 0, "limit": 2, "done": 0 }
    },
    "needLogin": false
  }
}
```

**注意**：`prizes` 不返回 probability 和 stock（防作弊）。

### POST /api/spin/:id/draw

执行一次抽奖（auth）。

**请求**：无 body

**响应**：
```json
{
  "success": true,
  "data": {
    "prize": { "id": 2, "name": "优惠券", "type": "coupon", "imageUrl": "..." },
    "remainingDraws": 2
  }
}
```

### POST /api/spin/:id/task

完成任务获取额外次数（auth）。

**请求**：
```json
{ "taskType": "checkin" }
```

**响应**：
```json
{
  "success": true,
  "data": { "message": "签到成功", "remainingDraws": 4 }
}
```

### GET /api/spin/:id/records

用户在该活动的抽奖记录（auth）。

**响应**：
```json
{
  "success": true,
  "data": [
    { "id": 1, "prize": { "name": "优惠券", "type": "coupon", "imageUrl": "..." }, "createdAt": "..." },
    { "id": 2, "prize": { "name": "谢谢参与", "type": "none", "imageUrl": null }, "createdAt": "..." }
  ]
}
```

## 抽奖核心逻辑

### 概率抽取算法

1. 从 `spin_prizes` 获取活动所有奖品
2. 过滤库存耗尽的奖品（`stock = 0`），将其概率累加到 `type='none'` 的奖品上
3. 生成加权随机数：
   - 计算有效概率总和（应为 1.0）
   - 生成 `[0, 1)` 随机数
   - 遍历奖品累加概率，随机数落在哪个区间即中哪个奖品
4. 若中奖奖品有库存限制：
   - `UPDATE spin_prizes SET stock = stock - 1 WHERE id = ? AND stock > 0`
   - 影响行数 = 0 说明并发下库存刚好耗尽，回退到"谢谢参与"

### 次数消耗顺序

`base → checkin → share`

先消耗基础免费次数，用完再消耗签到获得的次数，最后消耗分享获得的次数。

### 当日剩余次数计算

```
对每个 source (base, checkin, share)：
  limit = spin_free_config.daily_limit（该 source 对应配置）
  used = COUNT(spin_records) WHERE source=? AND user_id=? AND activity_id=? AND DATE(created_at) = CURDATE()

  对 checkin/share：
    task_done = COUNT(spin_task_records) WHERE task_type=? AND user_id=? AND activity_id=? AND DATE(created_at) = CURDATE()
    若 task_done = 0，则该 source 可用次数 = 0

  remaining = MAX(0, limit - used)

总剩余 = SUM(各 source remaining)
```

### 并发安全

- **库存扣减**：MySQL 乐观更新 `stock = stock - 1 WHERE stock > 0`，无需加锁
- **次数控制**：基于记录计数控制，并发下最多多抽 1 次（可接受）
- **无需分布式锁**：每次抽奖是独立请求，库存靠数据库原子操作保证

### 防刷策略

- 接口级别：auth 中间件 + 用户维度限频
- 次数级别：基于 `spin_records` + `spin_task_records` 双表计数
- 库存级别：数据库原子操作兜底

## 项目结构

```
src/
├── routes/spin.js              # 即时抽奖路由
├── services/spin.js            # 活动查询、次数计算、任务完成
├── services/spin-draw.js       # 概率抽取核心逻辑
└── db/migrations/
    ├── 006_create_spin_activities.sql
    ├── 007_create_spin_prizes.sql
    ├── 008_create_spin_free_config.sql
    ├── 009_create_spin_records.sql
    └── 010_create_spin_task_records.sql
```

`app.js` 中挂载 spin 路由，无需 cron 任务。

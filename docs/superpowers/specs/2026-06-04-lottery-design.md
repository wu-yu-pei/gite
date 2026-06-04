# 抽奖功能设计文档

## 概述

微信小程序每日抽奖功能。每天一个活动，用户登录即可参与，支持定时开奖和人满开奖两种模式。奖品外部发放，用户自行查看结果。

## 数据库设计

### prizes 奖品表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT UNSIGNED PK AUTO_INCREMENT | 奖品 ID |
| name | VARCHAR(128) | 奖品名称 |
| type | VARCHAR(64) | 奖品类型（physical / virtual / coupon） |
| image_url | VARCHAR(512) NULL | 奖品图片 |
| created_at | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | |
| updated_at | TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | |

### lotteries 活动表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT UNSIGNED PK AUTO_INCREMENT | 活动 ID |
| title | VARCHAR(128) | 活动标题 |
| description | TEXT | 活动描述 |
| prize_id | INT UNSIGNED | 关联奖品 |
| winner_count | INT UNSIGNED | 中奖人数 |
| draw_mode | ENUM('scheduled', 'full') | 开奖模式：定时 / 人满 |
| draw_at | DATETIME NULL | 定时开奖时间（scheduled 时必填） |
| max_participants | INT UNSIGNED NULL | 最大参与人数（full 时必填） |
| status | ENUM('pending', 'active', 'drawn', 'cancelled') | 活动状态 |
| drawn_at | DATETIME NULL | 实际开奖时间 |
| created_at | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | |
| updated_at | TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | |

**索引**：`INDEX idx_status_draw (status, draw_mode, draw_at)` — 加速定时任务扫描

### lottery_participants 参与记录表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT UNSIGNED PK AUTO_INCREMENT | |
| lottery_id | INT UNSIGNED | 关联活动 |
| user_id | INT UNSIGNED | 关联用户 |
| is_winner | TINYINT(1) DEFAULT 0 | 是否中奖 |
| created_at | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | 参与时间 |

**约束**：`UNIQUE(lottery_id, user_id)` — 数据库层面防止重复参与

## API 设计

所有接口前缀 `/api/lottery`，需登录（auth 中间件）。

### GET /api/lottery

获取当天活动详情。

**查询逻辑**：`status IN ('active', 'drawn') AND DATE(created_at) = CURDATE()`

**响应**：
```json
{
  "success": true,
  "data": {
    "id": 1,
    "title": "每日抽奖",
    "description": "...",
    "prize": {
      "id": 1,
      "name": "奖品名",
      "type": "physical",
      "imageUrl": "https://..."
    },
    "winnerCount": 3,
    "drawMode": "scheduled",
    "drawAt": "2026-06-04T20:00:00.000Z",
    "maxParticipants": null,
    "status": "active",
    "drawnAt": null,
    "participantCount": 128,
    "hasJoined": true
  }
}
```

### POST /api/lottery/join

参与当天抽奖。

**校验**：
1. 当天活动存在且 status = 'active'
2. 数据库唯一索引兜底防重复

**人满开奖触发**：参与后检查当前人数，若 `draw_mode = 'full'` 且达到 `max_participants`，立即触发开奖。

**响应**：
```json
{
  "success": true,
  "data": { "message": "参与成功" }
}
```

### GET /api/lottery/join/list

获取当天活动所有参与者头像列表。

**响应**：
```json
{
  "success": true,
  "data": [
    { "userId": 1, "avatarUrl": "https://...", "nickName": "用户A" },
    { "userId": 2, "avatarUrl": "https://...", "nickName": "用户B" }
  ]
}
```

### GET /api/lottery/result

查看当天活动开奖结果。

**校验**：活动 status = 'drawn'，否则返回未开奖提示。

**响应**：
```json
{
  "success": true,
  "data": {
    "lotteryId": 1,
    "status": "drawn",
    "drawnAt": "2026-06-04T20:00:00.000Z",
    "winners": [
      { "userId": 1, "nickName": "用户A", "avatarUrl": "https://..." },
      { "userId": 3, "nickName": "用户C", "avatarUrl": "https://..." }
    ]
  }
}
```

### GET /api/lottery/my

我参与的活动列表（含中奖状态）。

**响应**：
```json
{
  "success": true,
  "data": [
    {
      "lotteryId": 1,
      "title": "每日抽奖",
      "status": "drawn",
      "isWinner": true,
      "prize": { "name": "奖品名", "type": "physical", "imageUrl": "https://..." },
      "createdAt": "2026-06-04T10:00:00.000Z"
    }
  ]
}
```

## 定时开奖机制

### 技术选型

使用 `node-cron` 每分钟轮询扫描需要开奖的活动。

### 触发条件

1. **定时开奖**：`draw_mode = 'scheduled' AND status = 'active' AND draw_at <= NOW()`，由 cron 任务触发
2. **人满开奖**：`draw_mode = 'full'`，在 join 接口中实时检查参与人数，达到 `max_participants` 立即触发

### 开奖流程

1. Redis 分布式锁 `lottery:draw:{id}`（TTL 30s），防止重复开奖
2. 获取锁后，再次确认活动 `status = 'active'`（双重检查）
3. 查询该活动所有参与者 ID
4. 随机抽取：`ORDER BY RAND() LIMIT {winner_count}`
5. 事务内执行：
   - 批量更新 `lottery_participants.is_winner = 1`
   - 更新 `lotteries.status = 'drawn'`，`drawn_at = NOW()`
6. 释放锁

### 异常处理

- 参与人数 < winner_count：全部中奖
- 开奖过程出错：事务回滚，下次 cron 周期重试
- 锁获取失败：跳过本次，下次 cron 周期重试

## 项目结构

新增文件遵循现有项目组织方式：

```
src/
├── routes/lottery.js          # 抽奖路由
├── services/lottery.js        # 抽奖业务逻辑
├── services/draw.js           # 开奖逻辑（含随机抽取）
├── cron/lottery.js            # 定时任务（node-cron）
└── db/migrations/
    ├── 002_create_prizes.sql
    ├── 003_create_lotteries.sql
    └── 004_create_lottery_participants.sql
```

## 新增依赖

- `node-cron`：定时任务调度

# Exchange Rewards Categories Design

## Summary

exchange_rewards 表支持分类，新建独立分类表 `exchange_categories`，前端接口按分类分组返回嵌套结构。

## Database

### New Table: `exchange_categories`

```sql
CREATE TABLE IF NOT EXISTS exchange_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL COMMENT '分类名称',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_active_sort (is_active, sort_order)
);
```

### Alter Table: `exchange_rewards`

```sql
ALTER TABLE exchange_rewards
  ADD COLUMN category_id INT UNSIGNED DEFAULT NULL COMMENT '所属分类' AFTER id,
  ADD CONSTRAINT fk_reward_category FOREIGN KEY (category_id) REFERENCES exchange_categories(id);
```

### Seed Data

```sql
INSERT INTO exchange_categories (name, sort_order) VALUES
('抽奖机会', 1),
('王者皮肤', 2),
('和平皮肤', 3),
('视频会议', 4),
('网盘会员', 5);
```

Existing rewards need to be assigned a `category_id` via manual UPDATE after migration.

## API Changes

### `GET /api/exchange/home`

Response changes from flat `rewards` array to nested `categories` structure:

```json
{
  "success": true,
  "data": {
    "fragmentBalance": 120,
    "categories": [
      {
        "id": 1,
        "name": "抽奖机会",
        "rewards": [
          {
            "id": 1,
            "name": "抽奖x1",
            "description": "兑换1次抽奖机会",
            "imageUrl": "",
            "type": "draws",
            "drawsQuantity": 1,
            "minDraws": 0,
            "fragmentCost": 3,
            "stock": null,
            "sortOrder": 0
          }
        ]
      }
    ]
  }
}
```

Rules:
- Only categories with `is_active=1` are returned
- Only categories that contain at least one active reward are returned
- Categories sorted by `sort_order` ASC
- Rewards within each category sorted by `sort_order` ASC

### `POST /api/exchange/redeem` — No change

### `GET /api/exchange/records` — No change

## Files to Change

1. **New**: `src/db/migrations/013_add_exchange_categories.sql` — create table, alter rewards, seed data
2. **Modify**: `src/services/exchange.js` — `getActiveExchangeRewards` query joins categories, returns grouped structure
3. **Modify**: `src/routes/exchange.js` — `/api/exchange/home` response format uses nested categories

-- 兑换商品添加最低抽奖次数门槛，0 表示无限制
ALTER TABLE exchange_rewards ADD COLUMN min_draws INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '需要累计抽奖次数才可兑换，0=无限制' AFTER draws_quantity;

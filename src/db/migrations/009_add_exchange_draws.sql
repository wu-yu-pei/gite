-- exchange_rewards 表新增 type 和 draws_quantity 列
ALTER TABLE exchange_rewards ADD COLUMN type ENUM('item', 'draws') NOT NULL DEFAULT 'item' COMMENT '奖励类型：item=实物/虚拟, draws=抽奖次数' AFTER image_url;
ALTER TABLE exchange_rewards ADD COLUMN draws_quantity INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '兑换抽奖次数（仅type=draws时有效）' AFTER type;

-- user_daily_state 表新增兑换获得的抽奖次数
ALTER TABLE user_daily_state ADD COLUMN exchange_draws_earned INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '通过碎片兑换获得的抽奖次数' AFTER invite_draws_earned;

-- 插入抽奖次数兑换示例数据
INSERT INTO exchange_rewards (name, description, image_url, type, draws_quantity, fragment_cost, stock, sort_order, is_active) VALUES
('抽奖x1', '兑换1次抽奖机会', '', 'draws', 1, 3, NULL, 0, 1),
('抽奖x5', '兑换5次抽奖机会', '', 'draws', 5, 12, NULL, 0, 1);

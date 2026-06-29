-- exchange_rewards 新增 is_manual 字段，标记是否需要人工兑换
ALTER TABLE exchange_rewards
  ADD COLUMN is_manual TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否需要人工兑换，0=自动，1=人工' AFTER min_draws;

-- draws 类型商品默认不需要人工兑换
UPDATE exchange_rewards SET is_manual = 0 WHERE type = 'draws';

-- exchange_records 新增 fulfillment_status 字段，人工兑换状态
ALTER TABLE exchange_records
  ADD COLUMN fulfillment_status ENUM('pending', 'completed') NOT NULL DEFAULT 'pending' COMMENT '兑换完成状态' AFTER fragment_cost;

-- 历史 draws 类型记录自动标记为已完成
UPDATE exchange_records er
  JOIN exchange_rewards ew ON ew.id = er.reward_id
  SET er.fulfillment_status = 'completed'
  WHERE ew.type = 'draws';

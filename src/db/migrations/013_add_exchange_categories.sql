-- 兑换商品分类表
CREATE TABLE IF NOT EXISTS exchange_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL COMMENT '分类名称',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_active_sort (is_active, sort_order)
);

-- exchange_rewards 新增 category_id 字段
ALTER TABLE exchange_rewards
  ADD COLUMN category_id INT UNSIGNED DEFAULT NULL COMMENT '所属分类' AFTER id,
  ADD CONSTRAINT fk_reward_category FOREIGN KEY (category_id) REFERENCES exchange_categories(id);

-- 预置分类数据
INSERT INTO exchange_categories (name, sort_order) VALUES
('抽奖机会', 1),
('王者皮肤', 2),
('和平皮肤', 3),
('视频会员', 4),
('网盘会员', 5);

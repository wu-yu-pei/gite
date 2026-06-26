-- 兑换奖励定义表
CREATE TABLE IF NOT EXISTS exchange_rewards (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL COMMENT '奖励名称',
  description VARCHAR(255) DEFAULT '' COMMENT '奖励描述',
  image_url VARCHAR(512) DEFAULT '',
  fragment_cost INT UNSIGNED NOT NULL COMMENT '所需碎片数量',
  stock INT DEFAULT NULL COMMENT 'NULL表示不限量',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_active_sort (is_active, sort_order)
);

-- 兑换记录表
CREATE TABLE IF NOT EXISTS exchange_records (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  reward_id INT UNSIGNED NOT NULL,
  fragment_cost INT UNSIGNED NOT NULL COMMENT '本次兑换消耗的碎片数',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_created (user_id, created_at DESC),
  CONSTRAINT fk_exchange_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_exchange_reward FOREIGN KEY (reward_id) REFERENCES exchange_rewards(id)
);

-- 示例兑换奖励数据
INSERT INTO exchange_rewards (name, description, image_url, fragment_cost, stock, sort_order, is_active) VALUES
('精美钥匙扣', '限量版定制钥匙扣', '', 10, 100, 1, 1),
('定制手机壳', '专属定制手机壳', '', 30, 50, 2, 1),
('优惠券10元', '全场通用优惠券', '', 5, NULL, 3, 1);

-- 碎片动态权重配置表
CREATE TABLE IF NOT EXISTS fragment_weight_config (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用动态权重调整',
  boost_max DECIMAL(6,2) NOT NULL DEFAULT 10.00 COMMENT '大碎片初始权重加成倍数',
  half_life INT UNSIGNED NOT NULL DEFAULT 50 COMMENT '每多少次抽奖加成减半',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO fragment_weight_config (is_enabled, boost_max, half_life) VALUES (1, 10.00, 50);

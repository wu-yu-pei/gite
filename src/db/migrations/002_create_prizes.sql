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
INSERT INTO pity_config (pity_threshold, pity_prize_id) VALUES (10, 3);

-- 为 prizes 表的 type 枚举添加 'fragment' 值
ALTER TABLE prizes MODIFY COLUMN type ENUM('physical', 'virtual', 'coupon', 'thanks', 'fragment') NOT NULL DEFAULT 'thanks';

-- 新增碎片数量列，仅当 type='fragment' 时有意义
ALTER TABLE prizes ADD COLUMN fragment_quantity INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '碎片奖品的数量' AFTER type;

-- 插入碎片奖品示例数据（可根据实际需求调整）
INSERT INTO prizes (name, description, image_url, type, fragment_quantity, weight, stock, sort_order, is_active) VALUES
('碎片x1', '获得1个碎片', '', 'fragment', 1, 80, NULL, 9, 1),
('碎片x3', '获得3个碎片', '', 'fragment', 3, 30, NULL, 10, 1);

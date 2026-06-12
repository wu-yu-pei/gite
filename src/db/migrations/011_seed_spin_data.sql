-- 即时抽奖种子数据

-- 活动1：转盘
INSERT INTO spin_activities (title, description, display_type, start_at, end_at, status)
VALUES ('夏日幸运转盘', '转动转盘赢好礼，每日免费3次，签到分享可获更多机会', 'wheel', '2026-06-01 00:00:00', '2026-12-31 23:59:59', 'active');

SET @wheel_id = LAST_INSERT_ID();

INSERT INTO spin_prizes (activity_id, name, type, image_url, probability, stock, sort_order) VALUES
(@wheel_id, 'iPhone 16 Pro',   'physical', NULL, 0.00500, 1,    0),
(@wheel_id, 'AirPods Pro',     'physical', NULL, 0.01500, 3,    1),
(@wheel_id, '50元优惠券',       'coupon',   NULL, 0.05000, NULL, 2),
(@wheel_id, '10元优惠券',       'coupon',   NULL, 0.10000, NULL, 3),
(@wheel_id, '5元优惠券',        'coupon',   NULL, 0.15000, NULL, 4),
(@wheel_id, '100积分',          'virtual',  NULL, 0.18000, NULL, 5),
(@wheel_id, '谢谢参与',         'none',     NULL, 0.50000, NULL, 6);

INSERT INTO spin_free_config (activity_id, source, daily_limit) VALUES
(@wheel_id, 'base',    3),
(@wheel_id, 'checkin', 1),
(@wheel_id, 'share',   2);

-- 活动2：九宫格
INSERT INTO spin_activities (title, description, display_type, start_at, end_at, status)
VALUES ('幸运九宫格', '点击九宫格抽奖，好运等你来', 'grid', '2026-06-01 00:00:00', '2026-12-31 23:59:59', 'active');

SET @grid_id = LAST_INSERT_ID();

INSERT INTO spin_prizes (activity_id, name, type, image_url, probability, stock, sort_order) VALUES
(@grid_id, '小米手环',    'physical', NULL, 0.02000, 5,    0),
(@grid_id, '30元红包',    'coupon',   NULL, 0.05000, NULL, 1),
(@grid_id, '10元红包',    'coupon',   NULL, 0.10000, NULL, 2),
(@grid_id, '5元红包',     'coupon',   NULL, 0.13000, NULL, 3),
(@grid_id, '200积分',     'virtual',  NULL, 0.10000, NULL, 4),
(@grid_id, '50积分',      'virtual',  NULL, 0.15000, NULL, 5),
(@grid_id, '10积分',      'virtual',  NULL, 0.15000, NULL, 6),
(@grid_id, '谢谢参与',    'none',     NULL, 0.30000, NULL, 7);

INSERT INTO spin_free_config (activity_id, source, daily_limit) VALUES
(@grid_id, 'base',    2),
(@grid_id, 'checkin', 1),
(@grid_id, 'share',   3);

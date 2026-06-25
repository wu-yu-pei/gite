ALTER TABLE prizes ADD COLUMN description VARCHAR(255) DEFAULT '' COMMENT '奖品描述' AFTER name;

UPDATE prizes SET description = '神秘大礼包一份' WHERE sort_order = 1;
UPDATE prizes SET description = '精美周边礼品' WHERE sort_order = 2;
UPDATE prizes SET description = '限定虚拟道具' WHERE sort_order = 3;
UPDATE prizes SET description = '全场通用优惠券' WHERE sort_order = 4;
UPDATE prizes SET description = '全场通用优惠券' WHERE sort_order = 5;
UPDATE prizes SET description = '下次好运' WHERE sort_order = 6;
UPDATE prizes SET description = '下次好运' WHERE sort_order = 7;
UPDATE prizes SET description = '下次好运' WHERE sort_order = 8

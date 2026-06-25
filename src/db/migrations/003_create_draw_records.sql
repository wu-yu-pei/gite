CREATE TABLE IF NOT EXISTS draw_records (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  prize_id INT UNSIGNED NOT NULL,
  is_pity TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_created (user_id, created_at DESC),
  CONSTRAINT fk_draw_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_draw_prize FOREIGN KEY (prize_id) REFERENCES prizes(id)
);

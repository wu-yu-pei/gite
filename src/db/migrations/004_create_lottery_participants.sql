CREATE TABLE IF NOT EXISTS lottery_participants (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lottery_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  is_winner TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_lottery_user (lottery_id, user_id)
);

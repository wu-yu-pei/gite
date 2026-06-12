CREATE TABLE IF NOT EXISTS spin_records (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  activity_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  prize_id INT UNSIGNED NOT NULL,
  source ENUM('base', 'checkin', 'share') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_activity_date (user_id, activity_id, created_at)
);

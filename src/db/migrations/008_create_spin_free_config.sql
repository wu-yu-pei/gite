CREATE TABLE IF NOT EXISTS spin_free_config (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  activity_id INT UNSIGNED NOT NULL,
  source ENUM('base', 'checkin', 'share') NOT NULL,
  daily_limit INT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_activity_source (activity_id, source)
);

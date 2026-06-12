CREATE TABLE IF NOT EXISTS spin_task_records (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  activity_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  task_type ENUM('checkin', 'share') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_activity_task (user_id, activity_id, task_type, created_at)
);

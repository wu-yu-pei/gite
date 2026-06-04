CREATE TABLE IF NOT EXISTS lotteries (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(128) NOT NULL,
  description TEXT,
  prize_id INT UNSIGNED NOT NULL,
  winner_count INT UNSIGNED NOT NULL,
  draw_mode ENUM('scheduled', 'full') NOT NULL,
  draw_at DATETIME DEFAULT NULL,
  max_participants INT UNSIGNED DEFAULT NULL,
  status ENUM('pending', 'active', 'drawn', 'cancelled') NOT NULL DEFAULT 'active',
  drawn_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status_draw (status, draw_mode, draw_at)
);

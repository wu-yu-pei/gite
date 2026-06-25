CREATE TABLE IF NOT EXISTS invitations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inviter_id INT UNSIGNED NOT NULL,
  invitee_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_invitee (invitee_id),
  INDEX idx_inviter (inviter_id),
  CONSTRAINT fk_inv_inviter FOREIGN KEY (inviter_id) REFERENCES users(id),
  CONSTRAINT fk_inv_invitee FOREIGN KEY (invitee_id) REFERENCES users(id)
);

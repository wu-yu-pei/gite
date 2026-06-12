ALTER TABLE lotteries
  ADD COLUMN start_at DATETIME DEFAULT NULL AFTER draw_mode,
  ADD COLUMN end_at DATETIME DEFAULT NULL AFTER start_at;

-- Update existing active lotteries: set start_at to created_at, end_at to draw_at
UPDATE lotteries SET start_at = created_at WHERE start_at IS NULL;
UPDATE lotteries SET end_at = draw_at WHERE end_at IS NULL AND draw_at IS NOT NULL;

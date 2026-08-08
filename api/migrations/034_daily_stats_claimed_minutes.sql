-- #383 (points integrity, #292): "a day can only hold a day" — the sum of the
-- CLAMPED estimates of today's scored completions. Once it reaches
-- PointsConfig::DAILY_BUDGET_MINUTES further completions score 0. Plain
-- single-statement ADD COLUMN (#184).
ALTER TABLE `daily_stats` ADD COLUMN `claimed_minutes` INT NOT NULL DEFAULT 0;

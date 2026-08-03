-- Composite index for the per-category filter + counts (#276) — queries are
-- `WHERE user_id = ? AND category_id = ?`, the same shape as 010's project
-- axis. Plain CREATE INDEX (no IF NOT EXISTS — MariaDB-only, errors on MySQL
-- 8.0 dev); a single statement runs once via the tracker (#103).
CREATE INDEX `tasks_user_category` ON `tasks` (`user_id`, `category_id`);

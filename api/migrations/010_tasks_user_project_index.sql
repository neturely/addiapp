-- Composite index for per-project task counts (#234) and the Unassigned filter
-- (#236) — both query `WHERE user_id = ? AND project_id [= ? | IS NULL]`.
-- Plain CREATE INDEX (no IF NOT EXISTS — MariaDB-only, errors on MySQL 8.0 dev);
-- a single statement runs once via the tracker and can't partially fail (#103).
CREATE INDEX `tasks_user_project` ON `tasks` (`user_id`, `project_id`);

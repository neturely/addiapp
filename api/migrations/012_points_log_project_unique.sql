-- Award-once-per-project idempotency (#240), mirroring UNIQUE(task_id) for the
-- per-task award-once invariant (#74): at most one bonus row per project. A UNIQUE
-- index over a nullable column still allows many NULLs (MySQL + MariaDB), so the
-- existing task-award rows (project_id NULL) are unaffected. Single statement.
CREATE UNIQUE INDEX `points_log_project_id_unique` ON `points_log` (`project_id`);

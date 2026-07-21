-- Link tasks to a project (#234). Nullable FK column — a task with no project is
-- "unassigned" (surfaced as the Unassigned tab in #236/B). Plain `ADD COLUMN`
-- (no `IF NOT EXISTS`, which is MariaDB-only and errors on the MySQL 8.0 dev DB):
-- a single statement runs exactly once via migrate.php's tracker and can't leave
-- a partial state (#103/#184). The FK constraint + index are separate files.
ALTER TABLE `tasks` ADD COLUMN `project_id` int NULL DEFAULT NULL;

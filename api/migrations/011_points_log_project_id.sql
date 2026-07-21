-- Project-completion bonus (#240): a points_log row can be a PROJECT bonus
-- instead of a task award. Nullable — task-award rows leave it NULL. Plain
-- ADD COLUMN (single statement, tracker-guarded; no MariaDB-only IF NOT EXISTS
-- per #103/#184). FK + unique index are separate files.
ALTER TABLE `points_log` ADD COLUMN `project_id` int NULL DEFAULT NULL;

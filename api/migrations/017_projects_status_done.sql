-- #310: project lifecycle gains an automatic, reversible 'done' state (mirrors
-- tasks). 'archived' stays the manual state; 'done' is set/cleared by
-- App\Projects\Lifecycle::sync on task mutations. Single-statement MODIFY
-- (MySQL 8 + MariaDB safe, #184 discipline); existing values are a subset, so
-- no data backfill is needed.
ALTER TABLE `projects` MODIFY `status` enum('active','done','archived') NOT NULL DEFAULT 'active';

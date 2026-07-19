-- Optional free-text description for a task (#184). Nullable — many quick tasks
-- won't have one. Capped at 1000 chars (varchar) + a server-side mb_strlen guard
-- + the client textarea maxLength.
--
-- NOTE: plain ADD COLUMN (no IF NOT EXISTS) on purpose — `ADD COLUMN IF NOT
-- EXISTS` is MariaDB-only and errors on the local MySQL 8.0 dev DB. A single
-- statement is safe without it: migrate.php's per-file tracker runs it exactly
-- once, and one statement can't leave a partial-failure state (#103).
ALTER TABLE `tasks` ADD COLUMN `description` varchar(1000) NULL DEFAULT NULL AFTER `title`;

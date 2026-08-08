-- #383 (points integrity, #292): the speed bonus is a one-shot sprint reward —
-- sending an in-progress task back to Ready forfeits it permanently. Sticky
-- flag set by the task PATCH on the in_progress -> backlog transition, never
-- cleared. Plain single-statement ADD COLUMN (#184: no IF NOT EXISTS — the
-- tracker runs it exactly once on both MySQL 8 and MariaDB).
ALTER TABLE `tasks` ADD COLUMN `bonus_forfeited` TINYINT(1) NOT NULL DEFAULT 0;

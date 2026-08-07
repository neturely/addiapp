-- Task archiving (#312): a separate AXIS on top of status (like the project /
-- category axes), completing the #310 lifecycle symmetry — done first, then
-- archive from done. NULL = not archived; the timestamp doubles as "when".
-- Single-statement plain ADD COLUMN (no IF NOT EXISTS — MariaDB-only, #184).
ALTER TABLE tasks ADD COLUMN archived_at datetime NULL DEFAULT NULL;

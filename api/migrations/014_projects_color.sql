-- #268 (epic #256 F): per-project colour as a PALETTE INDEX (not a hex) — the
-- fixed palette lives client-side, so re-tuning colours never needs a migration.
-- Single-statement plain ADD COLUMN (no IF NOT EXISTS — MariaDB-only, #184);
-- NOT NULL DEFAULT 0 makes existing projects valid with no backfill step.
ALTER TABLE projects ADD COLUMN color TINYINT UNSIGNED NOT NULL DEFAULT 0;

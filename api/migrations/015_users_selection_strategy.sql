-- #266 (epic #256 E): per-user Play selection strategy — finally wiring the
-- Selection::strategies() seam. Value = a strategy NAME (validated against the
-- seam server-side). Single-statement plain ADD COLUMN (no IF NOT EXISTS —
-- MariaDB-only, #184); NOT NULL DEFAULT keeps existing users on the long-time
-- default without a backfill.
ALTER TABLE users ADD COLUMN selection_strategy VARCHAR(32) NOT NULL DEFAULT 'weightedByAge';

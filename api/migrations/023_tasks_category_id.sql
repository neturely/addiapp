-- Task → category assignment (#276): nullable, one category per task (a
-- list-like axis, not tags — decided over #179's multi-tag shape). Single-
-- statement plain ADD COLUMN (no IF NOT EXISTS — MariaDB-only, #184).
ALTER TABLE tasks ADD COLUMN category_id int NULL DEFAULT NULL;

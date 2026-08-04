-- #250: scheduled availability ("snooze until") — NULL = available now.
-- Play selection excludes rows with a future date; the dashboard shows them
-- with a "from <date>" chip. Also the landing column for spawned recurring
-- occurrences. Plain ADD COLUMN (single statement, #184 engine caveat).
ALTER TABLE tasks ADD COLUMN available_from DATE NULL;

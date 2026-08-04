-- #250: recurrence rule, interval family — every N days/weeks/months.
-- All recur_* columns NULL = not recurring. The two families are mutually
-- exclusive: unit+interval set (day-of-month NULL), or day-of-month set
-- (unit+interval NULL).
ALTER TABLE tasks ADD COLUMN recur_unit ENUM('day','week','month') NULL;

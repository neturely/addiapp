-- #250: recurrence rule, day-of-month family — monthly on/after day D
-- (1-31; 29-31 clamp to the month's last day at computation time).
ALTER TABLE tasks ADD COLUMN recur_day_of_month TINYINT NULL;

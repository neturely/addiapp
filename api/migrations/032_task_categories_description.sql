-- #336: categories gain an optional description, same shape as
-- projects.description (varchar(1000), empty → NULL). Plain ADD COLUMN —
-- single statement, #184 engine caveat.
ALTER TABLE task_categories ADD COLUMN description varchar(1000) NULL DEFAULT NULL;

-- FK for tasks.project_id (#234), separate single-statement file (#103). ON
-- DELETE SET NULL: deleting a project unassigns its tasks (they survive as
-- unassigned) rather than cascading the tasks away.
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_project_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE SET NULL;

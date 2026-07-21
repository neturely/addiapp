-- FK for points_log.project_id (#240), single-statement file (#103). ON DELETE
-- SET NULL: deleting a project keeps its awarded bonus in the points total but
-- drops the link (mirrors points_log.task_id's ON DELETE SET NULL).
ALTER TABLE `points_log` ADD CONSTRAINT `points_log_project_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE SET NULL;

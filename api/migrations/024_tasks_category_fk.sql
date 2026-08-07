-- FK for tasks.category_id (#276): deleting a category NEVER deletes its tasks
-- — they just lose the label (SET NULL), mirroring the project FK (009).
ALTER TABLE tasks ADD CONSTRAINT `tasks_category_id_fk` FOREIGN KEY (`category_id`) REFERENCES `task_categories`(`id`) ON DELETE SET NULL;

-- User-defined task categories (#276): lightweight custom lists in the rail, a
-- SECOND AXIS beside status (like the project axis) — statuses and the
-- Play/points machinery are untouched. `color` is a palette INDEX into the
-- shared #268 palette (client/src/lib/projectColors.ts), like projects.color.
CREATE TABLE IF NOT EXISTS `task_categories` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `color` tinyint NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `task_categories_user_idx` (`user_id`),
  CONSTRAINT `task_categories_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

-- Projects (#234, epic #233): group tasks under a user-scoped project. Matches
-- the `tasks`/`users` column style (backticked, now()/ON UPDATE timestamps).
-- `status` is the project lifecycle: 'active' or 'archived' (archive = the
-- terminal/"completed" state; there is no separate archived-browsing view in v1).
CREATE TABLE IF NOT EXISTS `projects` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` varchar(1000) NULL DEFAULT NULL,
  `status` enum('active','archived') NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `projects_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

-- AddiApp schema (ported 1:1 from the Drizzle-generated migrations 0000–0003).
-- Same tables/columns/constraints the Node backend used; consolidated for the
-- fresh PHP backend. Applied by migrate.php, tracked in `_migrations`.

CREATE TABLE IF NOT EXISTS `users` (
  `id` int AUTO_INCREMENT NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `display_name` varchar(100) NULL DEFAULT NULL,
  `email_verified` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`)
);

CREATE TABLE IF NOT EXISTS `sessions` (
  `id` varchar(64) NOT NULL,
  `user_id` int NOT NULL,
  `expires_at` timestamp NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  CONSTRAINT `sessions_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `tasks` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `title` varchar(255) NOT NULL,
  `complexity` enum('low','medium','high') NOT NULL,
  `estimated_minutes` int NOT NULL,
  `status` enum('backlog','in_progress','done') NOT NULL DEFAULT 'backlog',
  `started_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `actual_minutes` int NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `tasks_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `points_log` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `task_id` int NULL DEFAULT NULL,
  `base_points` int NOT NULL,
  `speed_bonus` int NOT NULL DEFAULT 0,
  `multiplier` decimal(4,2) NOT NULL DEFAULT '1.00',
  `total_points` int NOT NULL,
  `awarded_at` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  -- Award-once idempotency, even under a concurrent double-complete race (#74).
  UNIQUE KEY `points_log_task_id_unique` (`task_id`),
  CONSTRAINT `points_log_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `points_log_task_id_fk` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `daily_stats` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `stat_date` date NOT NULL,
  `tasks_completed` int NOT NULL DEFAULT 0,
  `points_earned` int NOT NULL DEFAULT 0,
  `multiplier` decimal(4,2) NOT NULL DEFAULT '1.00',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `daily_stats_user_date_unq` (`user_id`,`stat_date`),
  CONSTRAINT `daily_stats_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `email_tokens` (
  `token` varchar(64) NOT NULL,
  `user_id` int NOT NULL,
  `type` enum('verify','reset') NOT NULL,
  `expires_at` timestamp NOT NULL,
  `used_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`token`),
  CONSTRAINT `email_tokens_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

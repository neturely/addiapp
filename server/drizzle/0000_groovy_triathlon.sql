CREATE TABLE `daily_stats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`stat_date` date NOT NULL,
	`tasks_completed` int NOT NULL DEFAULT 0,
	`points_earned` int NOT NULL DEFAULT 0,
	`multiplier` decimal(4,2) NOT NULL DEFAULT '1.00',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `daily_stats_id` PRIMARY KEY(`id`),
	CONSTRAINT `daily_stats_user_date_unq` UNIQUE(`user_id`,`stat_date`)
);
--> statement-breakpoint
CREATE TABLE `points_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`task_id` int,
	`base_points` int NOT NULL,
	`speed_bonus` int NOT NULL DEFAULT 0,
	`multiplier` decimal(4,2) NOT NULL DEFAULT '1.00',
	`total_points` int NOT NULL,
	`awarded_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `points_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`complexity` enum('low','medium','high') NOT NULL,
	`estimated_minutes` int NOT NULL,
	`status` enum('backlog','in_progress','done') NOT NULL DEFAULT 'backlog',
	`started_at` timestamp,
	`completed_at` timestamp,
	`actual_minutes` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(255) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`display_name` varchar(100),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `daily_stats` ADD CONSTRAINT `daily_stats_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `points_log` ADD CONSTRAINT `points_log_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `points_log` ADD CONSTRAINT `points_log_task_id_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
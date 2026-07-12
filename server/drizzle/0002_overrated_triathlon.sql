CREATE TABLE `email_tokens` (
	`token` varchar(64) NOT NULL,
	`user_id` int NOT NULL,
	`type` enum('verify','reset') NOT NULL,
	`expires_at` timestamp NOT NULL,
	`used_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_tokens_token` PRIMARY KEY(`token`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `email_tokens` ADD CONSTRAINT `email_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
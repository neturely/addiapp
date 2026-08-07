-- In-app notifications (#366). First type: 'recurring_activated' — a #250
-- clone's available_from date arriving, detected by a lazy sweep on the
-- notifications fetch (no persistent process on this hosting). `data` is a
-- JSON snapshot (title + rule) rendered by the client. A notification lives
-- with its task: the FK CASCADEs on task delete, and completing the task
-- deletes its rows too (TasksController). A USER dismiss is a SOFT delete
-- (`dismissed_at`) — the row must survive as the dedupe anchor, because
-- UNIQUE(type, task_id) + INSERT IGNORE is what stops the next sweep from
-- resurrecting a dismissed notification whose task is still due (#74
-- idempotency pattern). created_at is set explicitly to the activation date.
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `type` varchar(40) NOT NULL,
  `task_id` int NULL DEFAULT NULL,
  `data` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `read_at` timestamp NULL DEFAULT NULL,
  `dismissed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `notifications_user_read_idx` (`user_id`, `read_at`),
  UNIQUE KEY `notifications_type_task_unique` (`type`, `task_id`),
  CONSTRAINT `notifications_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `notifications_task_id_fk` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE CASCADE
);

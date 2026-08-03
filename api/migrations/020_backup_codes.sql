-- Optional TOTP 2FA (#319): single-use backup codes — the recovery path for a
-- lost authenticator. Only bcrypt hashes are stored (plaintext is shown exactly
-- once at confirm time); `used_at` marks consumption so each code works once.
CREATE TABLE IF NOT EXISTS `backup_codes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `code_hash` varchar(255) NOT NULL,
  `used_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `backup_codes_user_idx` (`user_id`),
  CONSTRAINT `backup_codes_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

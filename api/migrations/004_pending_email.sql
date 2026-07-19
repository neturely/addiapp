-- Pending email for the change-email re-verification flow (#200). Nullable; holds
-- the requested new address until its confirm link is clicked, at which point it
-- swaps into `email` and clears. Plain ADD COLUMN (MySQL-8.0/MariaDB-safe, #184).
ALTER TABLE `users` ADD COLUMN `pending_email` varchar(255) NULL DEFAULT NULL AFTER `email`;

-- Personal notes scratchpad (#405): ONE row per user, holding one big free-text
-- page. Deliberately a TABLE rather than a users column so a later multi-page
-- evolution only has to drop the unique index and add a title — no schema
-- surgery on `users`. Content is plain text (no markdown in v1).
--
-- MEDIUMTEXT, not TEXT: the API caps content at 100,000 CHARACTERS, while TEXT
-- holds 65,535 BYTES — so a long ASCII note would be truncated by the column
-- before the validator ever saw it, and a note in a multi-byte script far
-- sooner. MEDIUMTEXT (16 MB) clears the cap at 4 bytes per character with room
-- to spare. CASCADEs with the user like every other owned table.
CREATE TABLE IF NOT EXISTS `notes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `content` mediumtext NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `notes_user_unique` (`user_id`),
  CONSTRAINT `notes_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

-- Allow the 'email_change' email-token type (#200). The enum only had
-- verify/reset; add the new value (a single MODIFY, safe under the file tracker).
ALTER TABLE `email_tokens` MODIFY COLUMN `type` enum('verify','reset','email_change') NOT NULL;

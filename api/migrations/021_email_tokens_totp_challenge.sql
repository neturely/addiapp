-- Allow the 'totp_challenge' token type (#319): the short-lived (5-min),
-- single-use handle a password-verified login holds while it awaits the OTP
-- code (a single MODIFY, safe under the file tracker — same shape as 005).
ALTER TABLE `email_tokens` MODIFY COLUMN `type` enum('verify','reset','email_change','totp_challenge') NOT NULL;

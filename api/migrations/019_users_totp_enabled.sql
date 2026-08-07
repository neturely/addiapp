-- Optional TOTP 2FA (#319): armed flag, separate from the secret so a staged
-- (unconfirmed) enrollment can never lock the user out — login only requires a
-- code once this is 1, which the confirm endpoint sets after a valid code.
ALTER TABLE users ADD COLUMN totp_enabled tinyint(1) NOT NULL DEFAULT 0;

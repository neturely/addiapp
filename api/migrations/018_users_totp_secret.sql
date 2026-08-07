-- Optional TOTP 2FA (#319): the base32 shared secret. NULL = not enrolled; a
-- non-NULL secret with totp_enabled=0 (migration 019) is a STAGED enrollment
-- awaiting code confirmation. Single-statement plain ADD COLUMN (no IF NOT
-- EXISTS — MariaDB-only, #184).
ALTER TABLE users ADD COLUMN totp_secret varchar(64) NULL DEFAULT NULL;

-- Fixed-window rate limiting for the email-sending / enumeration-prone endpoints
-- (resend-verification, forgot-password). Replaces express-rate-limit, which was
-- in-process; PHP is stateless so the window lives in the DB.

CREATE TABLE IF NOT EXISTS `rate_limits` (
  `bucket` varchar(191) NOT NULL,
  `hits` int NOT NULL DEFAULT 0,
  `window_start` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`bucket`)
);

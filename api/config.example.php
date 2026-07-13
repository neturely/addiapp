<?php

/**
 * Copy to `config.php` and fill in real values. In PRODUCTION place `config.php`
 * OUTSIDE the web root (point ADDIAPP_CONFIG at it) so secrets are never served
 * or committed. In local dev you can instead export the matching env vars
 * (DATABASE_URL, RESEND_API_KEY, …) and skip this file entirely.
 *
 * Precedence: built-in defaults < environment variables < this file.
 */

return [
    'databaseUrl' => 'mysql://addiapp:addiapp@localhost:3306/addiapp',
    'appUrl'      => 'http://localhost:5173',   // frontend base, used in email links
    'appTimezone' => 'Europe/Stockholm',        // midnight that resets the daily multiplier
    'resendApiKey' => '',                        // empty → console email transport (dev/test)
    'emailFrom'   => 'AddiApp <onboarding@resend.dev>',
    'isProd'      => false,
];

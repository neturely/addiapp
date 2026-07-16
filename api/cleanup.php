<?php

declare(strict_types=1);

/**
 * Nightly cleanup (OPS-4, #109). Three tables only filter expired rows at read
 * time and never delete them, so they grow unbounded:
 *   - sessions      → rows past expires_at just fail the read check and linger
 *   - email_tokens  → consume() sets used_at but never deletes the row
 *   - rate_limits   → the fixed window resets in place; rows persist forever
 *
 * This deletes the expired/stale rows. Idempotent — safe to re-run (a second run
 * simply deletes 0). Run from cron alongside backup-db.sh (see docs/DEPLOY.md).
 * Usage: `php cleanup.php`.
 */

require __DIR__ . '/src/autoload.php';

use App\Db;

$deletes = [
    'sessions' => 'DELETE FROM `sessions` WHERE `expires_at` < NOW()',
    'email_tokens' => 'DELETE FROM `email_tokens` WHERE `expires_at` < NOW()',
    // rate_limits has no expiry column; a bucket older than a day is well past
    // any window and safe to drop (a new hit just recreates the row).
    'rate_limits' => 'DELETE FROM `rate_limits` WHERE `window_start` < NOW() - INTERVAL 1 DAY',
];

try {
    $pdo = Db::pdo();
    $total = 0;
    foreach ($deletes as $table => $sql) {
        $n = (int) $pdo->exec($sql);
        $total += $n;
        echo "[addiapp-cleanup] {$table}: deleted {$n}\n";
    }
    echo '[addiapp-cleanup] ' . date('Y-m-d H:i:s') . " done ({$total} rows)\n";
} catch (\Throwable $e) {
    fwrite(STDERR, '[addiapp-cleanup] failed: ' . $e->getMessage() . "\n");
    exit(1);
}

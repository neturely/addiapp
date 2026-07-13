<?php

declare(strict_types=1);

namespace App;

/**
 * DB-backed fixed-window rate limiter (replaces express-rate-limit; PHP is
 * stateless). One row per action+IP bucket; the window resets lazily on the
 * first hit after it lapses. Returns true if the request is allowed.
 */
final class RateLimit
{
    public static function check(string $action, string $ip, int $limit = 5, int $windowSeconds = 900): bool
    {
        $bucket = $action . ':' . $ip;
        $pdo = Db::pdo();

        // $windowSeconds is an internal int constant — safe to inline.
        $pdo->prepare(
            'INSERT INTO rate_limits (bucket, hits, window_start) VALUES (?, 1, NOW())
             ON DUPLICATE KEY UPDATE
               hits = IF(window_start < (NOW() - INTERVAL ' . $windowSeconds . ' SECOND), 1, hits + 1),
               window_start = IF(window_start < (NOW() - INTERVAL ' . $windowSeconds . ' SECOND), NOW(), window_start)',
        )->execute([$bucket]);

        $stmt = $pdo->prepare('SELECT hits FROM rate_limits WHERE bucket = ?');
        $stmt->execute([$bucket]);
        return (int) $stmt->fetchColumn() <= $limit;
    }
}

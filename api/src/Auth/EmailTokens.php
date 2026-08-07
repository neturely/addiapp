<?php

declare(strict_types=1);

namespace App\Auth;

use App\Db;

/**
 * Single-use, time-limited tokens for email flows. `verify` lasts 24h, `reset`
 * 1h, `totp_challenge` 5min (#319 — not emailed: the opaque handle a
 * password-verified login holds while awaiting the OTP code). Consumption is
 * atomic (a conditional UPDATE), so a token is usable exactly once even under
 * concurrent requests.
 */
final class EmailTokens
{
    public static function create(int $userId, string $type): string
    {
        $token = bin2hex(random_bytes(32));
        $interval = match ($type) {
            'reset' => 'INTERVAL 1 HOUR',
            'totp_challenge' => 'INTERVAL 5 MINUTE',
            default => 'INTERVAL 24 HOUR',
        };
        Db::pdo()
            ->prepare("INSERT INTO email_tokens (token, user_id, type, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), $interval))")
            ->execute([$token, $userId, $type]);
        return $token;
    }

    /** Validate + mark used atomically. Returns the owning user id, or null. */
    public static function consume(string $token, string $type): ?int
    {
        $pdo = Db::pdo();
        $upd = $pdo->prepare(
            'UPDATE email_tokens SET used_at = NOW()
             WHERE token = ? AND type = ? AND used_at IS NULL AND expires_at > NOW()',
        );
        $upd->execute([$token, $type]);
        if ($upd->rowCount() === 0) {
            return null;
        }

        $sel = $pdo->prepare('SELECT user_id FROM email_tokens WHERE token = ?');
        $sel->execute([$token]);
        $row = $sel->fetch();
        return $row === false ? null : (int) $row['user_id'];
    }

    /**
     * Validate WITHOUT consuming — a failed OTP attempt must leave the login
     * challenge reusable for a retry (#319; the rate limiter bounds attempts).
     * Returns the owning user id, or null when invalid/expired/used.
     */
    public static function peek(string $token, string $type): ?int
    {
        $stmt = Db::pdo()->prepare(
            'SELECT user_id FROM email_tokens
             WHERE token = ? AND type = ? AND used_at IS NULL AND expires_at > NOW() LIMIT 1',
        );
        $stmt->execute([$token, $type]);
        $row = $stmt->fetch();
        return $row === false ? null : (int) $row['user_id'];
    }
}

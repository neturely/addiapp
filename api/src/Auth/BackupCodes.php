<?php

declare(strict_types=1);

namespace App\Auth;

use App\Db;

/**
 * Single-use 2FA backup codes (#319) — the recovery path when the
 * authenticator is lost. Plaintext exists only in the issue() return value
 * (shown to the user exactly once); the table stores bcrypt hashes, and
 * consumption marks `used_at` so each code works once.
 */
final class BackupCodes
{
    public const COUNT = 10;
    /** Chars per code (base32 alphabet → 50 bits; bcrypt-hashed + rate-limited). */
    private const LENGTH = 10;

    /**
     * Generate a fresh set for the user, replacing any existing one.
     * @return list<string> the plaintext codes, formatted xxxxx-xxxxx
     */
    public static function issue(int $userId): array
    {
        $pdo = Db::pdo();
        $pdo->prepare('DELETE FROM backup_codes WHERE user_id = ?')->execute([$userId]);

        $ins = $pdo->prepare('INSERT INTO backup_codes (user_id, code_hash) VALUES (?, ?)');
        $codes = [];
        for ($i = 0; $i < self::COUNT; $i++) {
            $raw = substr(Totp::base32Encode(random_bytes(8)), 0, self::LENGTH);
            $ins->execute([$userId, Passwords::hash($raw)]);
            $codes[] = strtolower(substr($raw, 0, 5) . '-' . substr($raw, 5));
        }
        return $codes;
    }

    /** Try a code for the user; on match mark it used. Normalizes case/dashes. */
    public static function consume(int $userId, string $code): bool
    {
        $normalized = strtoupper((string) preg_replace('/[^A-Za-z2-7]/', '', $code));
        if (strlen($normalized) !== self::LENGTH) {
            return false;
        }

        $pdo = Db::pdo();
        $stmt = $pdo->prepare('SELECT id, code_hash FROM backup_codes WHERE user_id = ? AND used_at IS NULL');
        $stmt->execute([$userId]);
        foreach ($stmt->fetchAll() as $row) {
            if (Passwords::verify($normalized, (string) $row['code_hash'])) {
                // Conditional UPDATE keeps it single-use even under a concurrent race.
                $upd = $pdo->prepare('UPDATE backup_codes SET used_at = NOW() WHERE id = ? AND used_at IS NULL');
                $upd->execute([(int) $row['id']]);
                return $upd->rowCount() === 1;
            }
        }
        return false;
    }

    public static function deleteAll(int $userId): void
    {
        Db::pdo()->prepare('DELETE FROM backup_codes WHERE user_id = ?')->execute([$userId]);
    }
}

<?php

declare(strict_types=1);

namespace App\Auth;

use App\Config;
use App\Db;
use App\Http\Request;

/**
 * DB-backed sessions (decision #1): an opaque random token in an httpOnly `sid`
 * cookie; the `sessions` row is the source of truth, so logout/expiry revoke
 * access immediately. Expiry is computed and checked with the DB clock (UTC).
 *
 * The 7-day TTL is SLIDING (#246): a validated request rolls `expires_at`
 * forward, so active users never hit a mid-habit logout while genuinely idle
 * sessions still lapse after TTL_DAYS. The write is throttled (only once the
 * remaining TTL drops below EXTEND_BELOW_DAYS — at most ~one write per day per
 * session) and capped at MAX_LIFETIME_DAYS from the session's creation, so
 * even a perpetually-active session has a hard ceiling.
 */
final class Sessions
{
    public const COOKIE = 'sid';
    private const TTL_DAYS = 7;
    private const EXTEND_BELOW_DAYS = 6;
    private const MAX_LIFETIME_DAYS = 60;

    public static function create(int $userId): string
    {
        $id = bin2hex(random_bytes(32));
        Db::pdo()
            ->prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ' . self::TTL_DAYS . ' DAY))')
            ->execute([$id, $userId]);
        return $id;
    }

    /** @return array{id:int,email:string,displayName:?string}|null */
    public static function currentUser(Request $req): ?array
    {
        $sid = $req->cookies[self::COOKIE] ?? null;
        if (!is_string($sid) || $sid === '') {
            return null;
        }

        $stmt = Db::pdo()->prepare(
            'SELECT u.id, u.email, u.display_name, u.selection_strategy
             FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE s.id = ? AND s.expires_at > NOW() LIMIT 1',
        );
        $stmt->execute([$sid]);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }

        self::slideExpiry($sid);

        return [
            'id' => (int) $row['id'],
            'email' => $row['email'],
            'displayName' => $row['display_name'],
            // Same Gravatar hash publicUser() emits (#174) — this array hydrates
            // $req->user, so /auth/me (the client's hydration path) carries it too.
            'gravatarHash' => md5(strtolower(trim((string) $row['email']))),
            // Play selection preference (#266) — Settings reads it off /auth/me.
            'selectionStrategy' => (string) $row['selection_strategy'],
        ];
    }

    /**
     * Roll the sliding window forward (#246). The WHERE clause is the whole
     * policy: extend only when the remaining TTL has dropped below
     * EXTEND_BELOW_DAYS (the ≤once/day throttle — NOT a write per request) and
     * only when the extension actually grows it (LEAST caps the new expiry at
     * MAX_LIFETIME_DAYS from creation, so a capped session stops extending).
     * On a real extension the cookie is re-issued with the DB's new expiry.
     */
    private static function slideExpiry(string $sid): void
    {
        $newExpiry = 'LEAST(DATE_ADD(NOW(), INTERVAL ' . self::TTL_DAYS . ' DAY),'
            . ' DATE_ADD(created_at, INTERVAL ' . self::MAX_LIFETIME_DAYS . ' DAY))';
        $stmt = Db::pdo()->prepare(
            "UPDATE sessions SET expires_at = $newExpiry
             WHERE id = ?
               AND expires_at < DATE_ADD(NOW(), INTERVAL " . self::EXTEND_BELOW_DAYS . " DAY)
               AND expires_at < $newExpiry",
        );
        $stmt->execute([$sid]);
        if ($stmt->rowCount() !== 1) {
            return;
        }

        $q = Db::pdo()->prepare('SELECT UNIX_TIMESTAMP(expires_at) FROM sessions WHERE id = ?');
        $q->execute([$sid]);
        $expires = (int) $q->fetchColumn();
        if ($expires > 0) {
            self::setCookie($sid, $expires);
        }
    }

    /** Drop rows past their expiry (#246) — run opportunistically on login; the
     *  SELECTs already ignore them, this just stops the table growing forever. */
    public static function purgeExpired(): void
    {
        Db::pdo()->exec('DELETE FROM sessions WHERE expires_at < NOW()');
    }

    public static function delete(string $sid): void
    {
        Db::pdo()->prepare('DELETE FROM sessions WHERE id = ?')->execute([$sid]);
    }

    /** Revoke ALL of a user's sessions (used after a password reset). */
    public static function deleteUserSessions(int $userId): void
    {
        Db::pdo()->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$userId]);
    }

    /** Revoke all of a user's sessions except one (keep the caller signed in after
     *  an in-settings password change, #187). Null $exceptSid revokes all. */
    public static function deleteUserSessionsExcept(int $userId, ?string $exceptSid): void
    {
        if ($exceptSid === null || $exceptSid === '') {
            self::deleteUserSessions($userId);
            return;
        }
        Db::pdo()->prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?')
            ->execute([$userId, $exceptSid]);
    }

    /** Issue the session cookie; $expires overrides for a sliding re-issue
     *  (#246). headers_sent() only guards the CLI/PHPUnit context — in the API
     *  the auth hook always runs before any output. */
    public static function setCookie(string $sid, ?int $expires = null): void
    {
        if (headers_sent()) {
            return;
        }
        $expires ??= time() + self::TTL_DAYS * 86400;
        setcookie(self::COOKIE, $sid, self::cookieOptions($expires));
    }

    public static function clearCookie(): void
    {
        setcookie(self::COOKIE, '', self::cookieOptions(time() - 3600));
    }

    /** @return array<string,mixed> */
    private static function cookieOptions(int $expires): array
    {
        return [
            'expires' => $expires,
            'path' => '/',
            'httponly' => true,
            'samesite' => 'Lax',
            'secure' => (bool) Config::get('isProd'),
        ];
    }
}

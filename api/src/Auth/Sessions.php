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
 */
final class Sessions
{
    public const COOKIE = 'sid';
    private const TTL_DAYS = 7;

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
            'SELECT u.id, u.email, u.display_name
             FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE s.id = ? AND s.expires_at > NOW() LIMIT 1',
        );
        $stmt->execute([$sid]);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }

        return [
            'id' => (int) $row['id'],
            'email' => $row['email'],
            'displayName' => $row['display_name'],
            // Same Gravatar hash publicUser() emits (#174) — this array hydrates
            // $req->user, so /auth/me (the client's hydration path) carries it too.
            'gravatarHash' => md5(strtolower(trim((string) $row['email']))),
        ];
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

    public static function setCookie(string $sid): void
    {
        setcookie(self::COOKIE, $sid, self::cookieOptions(time() + self::TTL_DAYS * 86400));
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

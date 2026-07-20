<?php

declare(strict_types=1);

namespace Tests\Db;

use App\Auth\Sessions;
use App\Http\Request;

/**
 * Tier-2 coverage (#128) for DB-backed sessions — the auth source of truth
 * (decision #1). Verifies token minting, cookie-based resolution, expiry, and
 * single/bulk revocation (logout and the password-reset "revoke all" path).
 */
final class SessionsTest extends DbTestCase
{
    /** Build a Request carrying only a `sid` cookie, as the auth middleware sees it. */
    private function requestWithSid(?string $sid): Request
    {
        return new Request('GET', '/api/tasks', [], [], $sid === null ? [] : ['sid' => $sid]);
    }

    public function testCreateInsertsOpaqueTokenWithSevenDayExpiry(): void
    {
        $userId = $this->makeUser('sess-create@test.local');
        $sid = Sessions::create($userId);

        // Opaque 256-bit token, hex-encoded.
        self::assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $sid);

        $stmt = $this->pdo->prepare(
            'SELECT user_id, TIMESTAMPDIFF(HOUR, NOW(), expires_at) AS hours FROM sessions WHERE id = ?',
        );
        $stmt->execute([$sid]);
        $row = $stmt->fetch();

        self::assertNotFalse($row);
        self::assertSame($userId, (int) $row['user_id']);
        // ~7 days (168h) out, allowing for the seconds elapsed since NOW().
        self::assertGreaterThan(166, (int) $row['hours']);
        self::assertLessThanOrEqual(168, (int) $row['hours']);
    }

    public function testCurrentUserResolvesValidSid(): void
    {
        $userId = $this->makeUser('sess-valid@test.local');
        $sid = Sessions::create($userId);

        $user = Sessions::currentUser($this->requestWithSid($sid));

        self::assertNotNull($user);
        self::assertSame($userId, $user['id']);
        self::assertSame('sess-valid@test.local', $user['email']);
    }

    public function testCurrentUserNullForUnknownToken(): void
    {
        $user = Sessions::currentUser($this->requestWithSid(bin2hex(random_bytes(32))));
        self::assertNull($user);
    }

    public function testCurrentUserNullWhenNoCookie(): void
    {
        self::assertNull(Sessions::currentUser($this->requestWithSid(null)));
    }

    public function testExpiredSessionResolvesNull(): void
    {
        $userId = $this->makeUser('sess-expired@test.local');
        // Insert a session that already lapsed — expiry is the source of truth.
        $sid = bin2hex(random_bytes(32));
        $this->pdo
            ->prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, DATE_SUB(NOW(), INTERVAL 1 HOUR))')
            ->execute([$sid, $userId]);

        self::assertNull(Sessions::currentUser($this->requestWithSid($sid)));
    }

    public function testDeleteRevokesSingleSession(): void
    {
        $userId = $this->makeUser('sess-delete@test.local');
        $keep = Sessions::create($userId);
        $drop = Sessions::create($userId);

        Sessions::delete($drop);

        self::assertNull(Sessions::currentUser($this->requestWithSid($drop)));
        // Only the targeted session is revoked; the other still resolves.
        self::assertNotNull(Sessions::currentUser($this->requestWithSid($keep)));
    }

    public function testDeleteUserSessionsRevokesAll(): void
    {
        $userId = $this->makeUser('sess-all@test.local');
        $a = Sessions::create($userId);
        $b = Sessions::create($userId);

        Sessions::deleteUserSessions($userId); // the password-reset path

        self::assertNull(Sessions::currentUser($this->requestWithSid($a)));
        self::assertNull(Sessions::currentUser($this->requestWithSid($b)));
    }

    public function testDeleteUserSessionsExceptKeepsCaller(): void
    {
        $userId = $this->makeUser('sess-except@test.local');
        $keep = Sessions::create($userId);
        $other = Sessions::create($userId);

        Sessions::deleteUserSessionsExcept($userId, $keep); // in-settings password change (#187)

        self::assertNotNull(Sessions::currentUser($this->requestWithSid($keep)));
        self::assertNull(Sessions::currentUser($this->requestWithSid($other)));
    }
}

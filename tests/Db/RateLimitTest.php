<?php

declare(strict_types=1);

namespace Tests\Db;

use App\RateLimit;

/**
 * Tier-2 coverage (#128) for the DB-backed fixed-window limiter (#80) — the gate
 * in front of login/register and the email endpoints. Verifies the allow/trip
 * boundary and the lazy window reset.
 */
final class RateLimitTest extends DbTestCase
{
    public function testAllowsUpToLimitThenTrips(): void
    {
        // limit 3: three hits allowed, the fourth trips.
        self::assertTrue(RateLimit::check('login-test', 'ip-a', 3, 900));
        self::assertTrue(RateLimit::check('login-test', 'ip-a', 3, 900));
        self::assertTrue(RateLimit::check('login-test', 'ip-a', 3, 900));
        self::assertFalse(RateLimit::check('login-test', 'ip-a', 3, 900));
    }

    public function testSeparateIdentifiersHaveSeparateBuckets(): void
    {
        RateLimit::check('login-test', 'ip-x', 1, 900); // ip-x now at its limit
        self::assertFalse(RateLimit::check('login-test', 'ip-x', 1, 900));
        // A different identifier is unaffected.
        self::assertTrue(RateLimit::check('login-test', 'ip-y', 1, 900));
    }

    public function testWindowResetReAllows(): void
    {
        self::assertTrue(RateLimit::check('reset-test', 'ip-b', 1, 900));
        self::assertFalse(RateLimit::check('reset-test', 'ip-b', 1, 900)); // tripped

        // Age the window past its length; the next hit resets the bucket to 1.
        $this->pdo->exec('UPDATE rate_limits SET window_start = DATE_SUB(NOW(), INTERVAL 1000 SECOND)');

        self::assertTrue(RateLimit::check('reset-test', 'ip-b', 1, 900));
    }
}

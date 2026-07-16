<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Turnstile;
use PHPUnit\Framework\TestCase;

/**
 * Guards the "no secret configured => CAPTCHA disabled" convention (#79). The
 * test env sets no TURNSTILE_SECRET, so verify() must short-circuit to true
 * WITHOUT a network call — this is what lets local dev run without a Cloudflare
 * account. A change that made verify() fail-closed by default would break dev
 * and must fail here. (The siteverify branches need the network and are covered
 * by manual end-to-end checks against Cloudflare's dummy keys.)
 */
final class TurnstileTest extends TestCase
{
    public function testDisabledWhenNoSecretConfigured(): void
    {
        self::assertTrue(Turnstile::verify('any-token', '203.0.113.1'));
        // Even a missing token passes when the feature is off (short-circuits
        // before the token check).
        self::assertTrue(Turnstile::verify(null, '203.0.113.1'));
    }
}

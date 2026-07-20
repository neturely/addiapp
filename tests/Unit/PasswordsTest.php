<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Auth\Passwords;
use PHPUnit\Framework\TestCase;

/**
 * Tier-2 coverage (#128) for the bcrypt wrapper — the credential-check primitive
 * behind login and the settings password change. Pure, no DB.
 */
final class PasswordsTest extends TestCase
{
    public function testHashVerifyRoundTrip(): void
    {
        $hash = Passwords::hash('correct horse battery staple');
        self::assertTrue(Passwords::verify('correct horse battery staple', $hash));
    }

    public function testVerifyRejectsWrongPassword(): void
    {
        $hash = Passwords::hash('correct-password');
        self::assertFalse(Passwords::verify('wrong-password', $hash));
    }

    public function testVerifyRejectsMalformedHash(): void
    {
        // A stored value that isn't a real bcrypt hash must never verify true.
        self::assertFalse(Passwords::verify('anything', 'not-a-bcrypt-hash'));
        self::assertFalse(Passwords::verify('anything', ''));
    }

    public function testHashesAreSalted(): void
    {
        // Same input, two calls → different hashes (per-hash random salt).
        self::assertNotSame(Passwords::hash('same'), Passwords::hash('same'));
    }

    public function testHashIsBcrypt(): void
    {
        // bcrypt identifier + cost 12, matching the documented setup.
        self::assertMatchesRegularExpression('/^\$2y\$12\$/', Passwords::hash('x'));
    }
}

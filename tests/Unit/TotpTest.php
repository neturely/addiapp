<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Auth\Totp;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class TotpTest extends TestCase
{
    /** RFC 6238 Appendix B secret: ASCII "12345678901234567890" in base32. */
    private const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

    /** @return array<string,array{int,string}> */
    public static function rfcVectors(): array
    {
        // The SHA1 rows of RFC 6238 Appendix B (8-digit codes).
        return [
            'T=59' => [59, '94287082'],
            'T=1111111109' => [1111111109, '07081804'],
            'T=1111111111' => [1111111111, '14050471'],
            'T=1234567890' => [1234567890, '89005924'],
            'T=2000000000' => [2000000000, '69279037'],
            'T=20000000000' => [20000000000, '65353130'],
        ];
    }

    #[DataProvider('rfcVectors')]
    public function testRfc6238AppendixBVectors(int $timestamp, string $expected): void
    {
        self::assertSame($expected, Totp::code(self::RFC_SECRET, $timestamp, 8));
    }

    public function testSixDigitCodeIsTheTruncatedTail(): void
    {
        // Default 6-digit output = the RFC value mod 10^6, zero-padded.
        self::assertSame('287082', Totp::code(self::RFC_SECRET, 59));
    }

    public function testVerifyAcceptsCurrentAndAdjacentWindows(): void
    {
        $secret = Totp::generateSecret();
        $now = 1_700_000_000;

        $current = Totp::code($secret, $now);
        $previous = Totp::code($secret, $now - 30);
        $next = Totp::code($secret, $now + 30);
        self::assertNotNull($current);

        self::assertTrue(Totp::verify($secret, (string) $current, $now));
        self::assertTrue(Totp::verify($secret, (string) $previous, $now), 'clock drift −1 step');
        self::assertTrue(Totp::verify($secret, (string) $next, $now), 'clock drift +1 step');
    }

    public function testVerifyRejectsOutsideTheDriftWindow(): void
    {
        $secret = Totp::generateSecret();
        $now = 1_700_000_000;

        $stale = Totp::code($secret, $now - 90);
        $future = Totp::code($secret, $now + 90);
        // ±3 steps can collide with the accepted window by 1-in-10^6 chance per
        // side; with a fixed timestamp this is deterministic per secret, and the
        // regenerated secret makes a permanent collision effectively impossible.
        self::assertFalse(Totp::verify($secret, (string) $stale, $now), 'stale code rejected');
        self::assertFalse(Totp::verify($secret, (string) $future, $now), 'future code rejected');
    }

    public function testVerifyRejectsMalformedCodes(): void
    {
        $secret = Totp::generateSecret();
        self::assertFalse(Totp::verify($secret, '', 1_700_000_000));
        self::assertFalse(Totp::verify($secret, '12345', 1_700_000_000));
        self::assertFalse(Totp::verify($secret, '1234567', 1_700_000_000));
        self::assertFalse(Totp::verify($secret, 'abcdef', 1_700_000_000));
    }

    public function testBase32RoundTrip(): void
    {
        for ($len = 1; $len <= 20; $len++) {
            $bytes = random_bytes($len);
            self::assertSame($bytes, Totp::base32Decode(Totp::base32Encode($bytes)));
        }
        // Case-insensitive and padding-tolerant on decode.
        self::assertSame('12345678901234567890', Totp::base32Decode(strtolower(self::RFC_SECRET)));
        self::assertSame('foo', Totp::base32Decode('MZXW6==='));
    }

    public function testBase32DecodeRejectsInvalidChars(): void
    {
        self::assertNull(Totp::base32Decode('ABC1DEF')); // '1' is not in the alphabet
        self::assertNull(Totp::base32Decode('ABC!DEF'));
    }

    public function testGeneratedSecretsAreDistinctAndWellFormed(): void
    {
        $a = Totp::generateSecret();
        $b = Totp::generateSecret();
        self::assertNotSame($a, $b);
        self::assertSame(32, strlen($a)); // 160 bits → 32 base32 chars
        self::assertMatchesRegularExpression('/^[A-Z2-7]+$/', $a);
    }

    public function testOtpauthUriShape(): void
    {
        $uri = Totp::otpauthUri('ABC234', 'user@example.com');
        self::assertSame(
            'otpauth://totp/AddiApp:user%40example.com?secret=ABC234&issuer=AddiApp&algorithm=SHA1&digits=6&period=30',
            $uri,
        );
    }
}

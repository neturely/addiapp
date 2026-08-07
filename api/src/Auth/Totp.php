<?php

declare(strict_types=1);

namespace App\Auth;

/**
 * Dependency-free RFC 6238 TOTP (#319): HMAC-SHA1 over a base32 shared secret,
 * 6 digits, 30-second step. Pure math — no DB, no state — so the unit suite
 * can pin it to the RFC's Appendix B vectors. Verification accepts ±1 step of
 * clock drift and compares with hash_equals (constant-time).
 */
final class Totp
{
    public const PERIOD = 30;
    public const DIGITS = 6;
    /** Steps of clock drift accepted either side of "now". */
    private const DRIFT_STEPS = 1;
    /** RFC 4648 base32 alphabet — what every authenticator app expects. */
    private const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    /** 160-bit secret (SHA1's block-appropriate size), base32 for manual entry. */
    public static function generateSecret(): string
    {
        return self::base32Encode(random_bytes(20));
    }

    /**
     * The otpauth:// provisioning URI authenticator apps import. Explicit
     * algorithm/digits/period params so non-default-assuming apps agree with us.
     */
    public static function otpauthUri(string $secret, string $email): string
    {
        return 'otpauth://totp/AddiApp:' . rawurlencode($email)
            . '?secret=' . $secret
            . '&issuer=AddiApp&algorithm=SHA1&digits=' . self::DIGITS . '&period=' . self::PERIOD;
    }

    /** The code for one time step, or null when the secret isn't valid base32. */
    public static function code(string $secret, int $timestamp, int $digits = self::DIGITS): ?string
    {
        $key = self::base32Decode($secret);
        if ($key === null || $key === '') {
            return null;
        }
        // 64-bit big-endian step counter ("J" needs 64-bit PHP — a given here).
        $counter = pack('J', intdiv($timestamp, self::PERIOD));
        $hash = hash_hmac('sha1', $counter, $key, true);
        // RFC 4226 dynamic truncation: low nibble of the last byte picks the offset.
        $offset = ord($hash[19]) & 0x0F;
        $value = ((ord($hash[$offset]) & 0x7F) << 24)
            | (ord($hash[$offset + 1]) << 16)
            | (ord($hash[$offset + 2]) << 8)
            | ord($hash[$offset + 3]);
        return str_pad((string) ($value % (10 ** $digits)), $digits, '0', STR_PAD_LEFT);
    }

    /** Verify a 6-digit code against the secret, allowing ±1 step of drift. */
    public static function verify(string $secret, string $code, ?int $timestamp = null): bool
    {
        $timestamp ??= time();
        $code = trim($code);
        if (preg_match('/^\d{' . self::DIGITS . '}$/', $code) !== 1) {
            return false;
        }
        // Check every window rather than returning early on a match so timing
        // doesn't reveal WHICH window matched; hash_equals guards each compare.
        $ok = false;
        for ($i = -self::DRIFT_STEPS; $i <= self::DRIFT_STEPS; $i++) {
            $expected = self::code($secret, $timestamp + $i * self::PERIOD);
            if ($expected !== null && hash_equals($expected, $code)) {
                $ok = true;
            }
        }
        return $ok;
    }

    public static function base32Encode(string $bytes): string
    {
        $out = '';
        $buffer = 0;
        $bits = 0;
        foreach (str_split($bytes) as $byte) {
            $buffer = ($buffer << 8) | ord($byte);
            $bits += 8;
            while ($bits >= 5) {
                $bits -= 5;
                $out .= self::ALPHABET[($buffer >> $bits) & 0x1F];
            }
        }
        if ($bits > 0) {
            $out .= self::ALPHABET[($buffer << (5 - $bits)) & 0x1F];
        }
        return $out; // unpadded — authenticator apps accept (and Google emits) this
    }

    /** Decode unpadded/padded base32 (case-insensitive); null on a bad char. */
    public static function base32Decode(string $s): ?string
    {
        $s = strtoupper(rtrim($s, '='));
        $out = '';
        $buffer = 0;
        $bits = 0;
        foreach (str_split($s) as $char) {
            $index = strpos(self::ALPHABET, $char);
            if ($index === false) {
                return null;
            }
            $buffer = ($buffer << 5) | $index;
            $bits += 5;
            if ($bits >= 8) {
                $bits -= 8;
                $out .= chr(($buffer >> $bits) & 0xFF);
            }
        }
        return $out;
    }
}

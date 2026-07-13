<?php

declare(strict_types=1);

namespace App\Auth;

/** bcrypt hashing (cost 12), matching the Node bcryptjs setup. */
final class Passwords
{
    private const COST = 12;

    public static function hash(string $plain): string
    {
        return password_hash($plain, PASSWORD_BCRYPT, ['cost' => self::COST]);
    }

    public static function verify(string $plain, string $hash): bool
    {
        return password_verify($plain, $hash);
    }
}

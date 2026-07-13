<?php

declare(strict_types=1);

namespace App;

/**
 * Runtime configuration. Precedence: defaults < environment variables <
 * config.php (if present). Production supplies secrets via a config.php placed
 * outside the web root (ADDIAPP_CONFIG); local dev uses env vars.
 */
final class Config
{
    /** @var array<string,mixed>|null */
    private static ?array $cache = null;

    /** @return array<string,mixed> */
    public static function all(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }

        $defaults = [
            'databaseUrl' => 'mysql://addiapp:addiapp@localhost:3306/addiapp',
            'appUrl' => 'http://localhost:5173',
            'appTimezone' => 'Europe/Stockholm',
            'resendApiKey' => '',
            'emailFrom' => 'AddiApp <onboarding@resend.dev>',
            'isProd' => false,
        ];

        $env = array_filter([
            'databaseUrl' => getenv('DATABASE_URL') ?: null,
            'appUrl' => getenv('APP_URL') ?: null,
            'appTimezone' => getenv('APP_TIMEZONE') ?: null,
            'resendApiKey' => getenv('RESEND_API_KEY') !== false ? getenv('RESEND_API_KEY') : null,
            'emailFrom' => getenv('ADDIAPP_EMAIL_FROM') ?: null,
            'isProd' => getenv('APP_ENV') !== false ? (getenv('APP_ENV') === 'production') : null,
        ], static fn ($v) => $v !== null);

        $file = getenv('ADDIAPP_CONFIG') ?: dirname(__DIR__) . '/config.php';
        $fromFile = is_file($file) ? (require $file) : [];

        return self::$cache = array_merge($defaults, $env, is_array($fromFile) ? $fromFile : []);
    }

    public static function get(string $key): mixed
    {
        return self::all()[$key] ?? null;
    }
}

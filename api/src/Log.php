<?php

declare(strict_types=1);

namespace App;

use App\Support\Timestamps;

/**
 * Lightweight structured logging (TECH-3, #122). Emits ONE JSON line per event
 * to `error_log` — timestamp, level, message, and light request context
 * (method, path, client IP) — replacing the ad-hoc `error_log('[addiapp-…] …')`
 * strings scattered across the app. Deliberately NOT a logging platform: no
 * external service, no dependency, just consistent parseable lines you can grep
 * (`grep addiapp-api`) or pipe through `jq`.
 *
 * Static and Request-free on purpose: it reads context straight from $_SERVER so
 * it works from the global exception handler, where no Request exists yet.
 */
final class Log
{
    public static function error(string $message, array $context = []): void
    {
        self::write('error', $message, $context);
    }

    public static function warn(string $message, array $context = []): void
    {
        self::write('warn', $message, $context);
    }

    public static function info(string $message, array $context = []): void
    {
        self::write('info', $message, $context);
    }

    /** @param array<string,mixed> $context */
    private static function write(string $level, string $message, array $context): void
    {
        $entry = [
            'ts' => Timestamps::nowIso(),
            'level' => $level,
            'app' => 'addiapp-api',
            'msg' => $message,
            'method' => $_SERVER['REQUEST_METHOD'] ?? null,
            'path' => self::path(),
            'ip' => self::clientIp(),
        ];
        if ($context !== []) {
            $entry['ctx'] = $context;
        }

        // JSON keeps it one line even with embedded newlines (e.g. a stack trace).
        // Fall back to a plain tagged line if the context isn't encodable.
        $line = json_encode($entry, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        error_log($line !== false ? $line : "[addiapp-api] {$level}: {$message}");
    }

    private static function path(): ?string
    {
        $uri = $_SERVER['REQUEST_URI'] ?? null;
        return is_string($uri) ? (parse_url($uri, PHP_URL_PATH) ?: null) : null;
    }

    /**
     * Mirrors Request::clientIp exactly (incl. the '0.0.0.0' fallback when
     * REMOTE_ADDR is absent, e.g. CLI/unusual SAPIs) so log lines and rate-limit
     * keys agree on the IP.
     */
    private static function clientIp(): string
    {
        $xff = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
        if ($xff !== '') {
            return trim(explode(',', $xff)[0]);
        }
        return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    }
}

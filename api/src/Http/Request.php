<?php

declare(strict_types=1);

namespace App\Http;

/** Parsed HTTP request. `user`/`userId` are populated by the auth middleware. */
final class Request
{
    /**
     * Cap the request body (PERF-3, #114). Every real payload here is tiny
     * (title ≤255 + a few scalars), so 64 KB is generous; anything larger is
     * junk/abuse and is rejected before it's decoded into memory.
     */
    private const MAX_BODY_BYTES = 64 * 1024;

    public ?int $userId = null;
    /** @var array{id:int,email:string,displayName:?string}|null */
    public ?array $user = null;

    /**
     * @param array<string,mixed> $query
     * @param array<string,mixed> $body
     * @param array<string,string> $cookies
     */
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $query,
        public readonly array $body,
        public readonly array $cookies,
    ) {
    }

    public static function fromGlobals(): self
    {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

        $body = [];
        $raw = self::readBody();
        if ($raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $body = $decoded;
            }
        }

        return new self($method, $path, $_GET, $body, $_COOKIE);
    }

    /**
     * Read the request body, capped at MAX_BODY_BYTES so an oversized payload is
     * never fully inflated into memory just to be rejected (#114). A cheap
     * Content-Length pre-check short-circuits when present; the length-capped read
     * (one byte past the cap) is the real guard, since Content-Length is absent on
     * chunked bodies and spoofable.
     */
    private static function readBody(): string
    {
        $declared = $_SERVER['CONTENT_LENGTH'] ?? null;
        if (is_numeric($declared) && (int) $declared > self::MAX_BODY_BYTES) {
            self::rejectTooLarge();
        }

        $raw = file_get_contents('php://input', false, null, 0, self::MAX_BODY_BYTES + 1);
        if ($raw === false) {
            return '';
        }
        if (strlen($raw) > self::MAX_BODY_BYTES) {
            self::rejectTooLarge();
        }
        return $raw;
    }

    private static function rejectTooLarge(): never
    {
        Response::error('Payload too large', 413);
        exit;
    }

    /** Raw string query param, or null. */
    public function query(string $key): ?string
    {
        $v = $this->query[$key] ?? null;
        return is_string($v) ? $v : null;
    }

    /** Raw JSON body field, or null. */
    public function input(string $key): mixed
    {
        return $this->body[$key] ?? null;
    }

    /** Client IP, honouring X-Forwarded-For (LiteSpeed/proxy) like the TS trust-proxy. */
    public function clientIp(): string
    {
        $xff = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
        if ($xff !== '') {
            return trim(explode(',', $xff)[0]);
        }
        return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    }
}

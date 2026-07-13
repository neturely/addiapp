<?php

declare(strict_types=1);

namespace App\Http;

/** Parsed HTTP request. `user`/`userId` are populated by the auth middleware. */
final class Request
{
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
        $raw = file_get_contents('php://input');
        if ($raw !== false && $raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $body = $decoded;
            }
        }

        return new self($method, $path, $_GET, $body, $_COOKIE);
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

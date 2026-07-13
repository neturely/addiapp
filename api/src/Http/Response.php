<?php

declare(strict_types=1);

namespace App\Http;

/** JSON response helpers. Every handler ends by calling one of these. */
final class Response
{
    /** @param array<string,mixed>|list<mixed>|null $data */
    public static function json(array|null $data, int $status = 200): void
    {
        http_response_code($status);
        if (!headers_sent()) {
            header('Content-Type: application/json');
        }
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    /** Machine `error` code + optional human `message` (matches the TS contract). */
    public static function error(string $error, int $status, ?string $message = null): void
    {
        $payload = ['error' => $error];
        if ($message !== null) {
            $payload['message'] = $message;
        }
        self::json($payload, $status);
    }

    public static function noContent(): void
    {
        http_response_code(204);
    }
}

<?php

declare(strict_types=1);

namespace App\Support;

/** MySQL UTC timestamps ↔ ISO-8601 with a trailing Z (matches JS Date.toISOString). */
final class Timestamps
{
    public static function iso(?string $dbValue): ?string
    {
        if ($dbValue === null) {
            return null;
        }
        return (new \DateTimeImmutable($dbValue, new \DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z');
    }

    public static function nowIso(): string
    {
        return (new \DateTimeImmutable('now', new \DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z');
    }
}

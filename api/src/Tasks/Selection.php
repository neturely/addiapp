<?php

declare(strict_types=1);

namespace App\Tasks;

/**
 * Play-mode task selection (ports tasks/selection.ts). Strategies take an
 * already-filtered candidate list (mapped task arrays with `id` + `createdAt`)
 * and return one, or null. Kept swappable so a future per-user preference is
 * `Selection::strategies()[$name]`, not a rewrite. `$rng` is injectable for
 * deterministic tests.
 */
final class Selection
{
    /** Oldest first, then lowest id — stable when timestamps collide. */
    private static function byAgeThenId(array $a, array $b): int
    {
        $at = strtotime((string) $a['createdAt']);
        $bt = strtotime((string) $b['createdAt']);
        return $at !== $bt ? $at <=> $bt : ((int) $a['id']) <=> ((int) $b['id']);
    }

    /**
     * Default: weighted random favouring older tasks (rank-based weights, so it's
     * pure). The oldest is the most likely pick but it stays random — nothing
     * rots in the backlog, yet a re-roll still feels fresh.
     */
    public static function weightedByAge(array $candidates, ?callable $rng = null): ?array
    {
        $rng ??= static fn (): float => mt_rand() / mt_getrandmax();
        $count = count($candidates);
        if ($count === 0) {
            return null;
        }
        if ($count === 1) {
            return $candidates[0];
        }

        usort($candidates, [self::class, 'byAgeThenId']);
        $total = $count * ($count + 1) / 2; // sum of weights n..1
        $r = $rng() * $total;
        for ($i = 0; $i < $count; $i++) {
            $r -= ($count - $i); // oldest heaviest
            if ($r < 0) {
                return $candidates[$i];
            }
        }
        return $candidates[$count - 1];
    }

    /** Deterministic: always the oldest matching task. */
    public static function oldestFirst(array $candidates, ?callable $rng = null): ?array
    {
        if (count($candidates) === 0) {
            return null;
        }
        usort($candidates, [self::class, 'byAgeThenId']);
        return $candidates[0];
    }

    /** Uniform random among matches. */
    public static function uniformRandom(array $candidates, ?callable $rng = null): ?array
    {
        $rng ??= static fn (): float => mt_rand() / mt_getrandmax();
        $count = count($candidates);
        if ($count === 0) {
            return null;
        }
        // Clamp: the default rng can return exactly 1.0 (mt_rand() == mt_getrandmax()),
        // which would otherwise index one past the end.
        $index = min((int) floor($rng() * $count), $count - 1);
        return $candidates[$index];
    }

    /** @return array<string,callable> name → strategy */
    public static function strategies(): array
    {
        return [
            'weightedByAge' => [self::class, 'weightedByAge'],
            'oldestFirst' => [self::class, 'oldestFirst'],
            'uniformRandom' => [self::class, 'uniformRandom'],
        ];
    }

    /** The active strategy (swap this to change selection app-wide). */
    public static function pick(array $candidates): ?array
    {
        return self::weightedByAge($candidates);
    }
}

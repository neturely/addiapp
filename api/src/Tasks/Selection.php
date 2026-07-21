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

    /**
     * "Focus on projects" mode (#238): given backlog candidate rows that each
     * carry `project_id`, `project_created_at`, `complexity`, `created_at`, `id`,
     * pick the OLDEST task of the active project CLOSEST to done. "Closest to done"
     * = least remaining effort = smallest Σ base points over the candidate set;
     * ties break to the oldest project (`project_created_at` ASC, then project id),
     * then the oldest task within it. Deterministic (no rng) — unit-testable with
     * plain arrays. Returns the chosen raw row, or null when there are no candidates.
     *
     * @param array<int,array<string,mixed>> $rows
     * @param array<string,int> $basePoints complexity → base points
     */
    public static function focusProject(array $rows, array $basePoints): ?array
    {
        if (count($rows) === 0) {
            return null;
        }

        // Group by project, accumulating remaining effort + the project's identity.
        $groups = [];
        foreach ($rows as $r) {
            $pid = (int) $r['project_id'];
            if (!isset($groups[$pid])) {
                $groups[$pid] = [
                    'effort' => 0,
                    'created' => strtotime((string) $r['project_created_at']),
                    'pid' => $pid,
                    'rows' => [],
                ];
            }
            $groups[$pid]['effort'] += $basePoints[$r['complexity']] ?? 0;
            $groups[$pid]['rows'][] = $r;
        }

        // Least remaining effort → oldest project → lowest project id.
        usort(
            $groups,
            static fn (array $a, array $b): int => ($a['effort'] <=> $b['effort'])
                ?: ($a['created'] <=> $b['created'])
                ?: ($a['pid'] <=> $b['pid']),
        );
        $chosen = $groups[0]['rows'];

        // Oldest task within the chosen project (created_at ASC, then id).
        usort($chosen, static function (array $a, array $b): int {
            $at = strtotime((string) $a['created_at']);
            $bt = strtotime((string) $b['created_at']);
            return $at !== $bt ? $at <=> $bt : ((int) $a['id']) <=> ((int) $b['id']);
        });
        return $chosen[0];
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

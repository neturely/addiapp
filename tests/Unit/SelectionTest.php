<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Points\PointsConfig;
use App\Tasks\Selection;
use PHPUnit\Framework\TestCase;

/**
 * Tier-1 regression for the pure task-selection strategies. `$rng` is injectable
 * precisely so these are deterministic — we drive it to the low and high ends to
 * pin the weighting behaviour without relying on randomness.
 */
final class SelectionTest extends TestCase
{
    /**
     * Deliberately NOT in age order (youngest is listed first) and the ids do NOT
     * correlate with age — so a passing test can't be quietly relying on input
     * order. By createdAt the oldest is id 10, then 20, then 30 (the youngest).
     */
    private const CANDIDATES = [
        ['id' => 30, 'createdAt' => '2026-01-03 10:00:00'], // youngest
        ['id' => 10, 'createdAt' => '2026-01-01 10:00:00'], // oldest
        ['id' => 20, 'createdAt' => '2026-01-02 10:00:00'],
    ];

    public function testEmptyCandidatesReturnNull(): void
    {
        self::assertNull(Selection::weightedByAge([]));
        self::assertNull(Selection::oldestFirst([]));
        self::assertNull(Selection::uniformRandom([]));
    }

    public function testSingleCandidateShortCircuits(): void
    {
        $only = ['id' => 99, 'createdAt' => '2026-01-01 10:00:00'];
        self::assertSame($only, Selection::weightedByAge([$only]));
        self::assertSame($only, Selection::oldestFirst([$only]));
    }

    public function testOldestFirstIsDeterministicOldest(): void
    {
        $picked = Selection::oldestFirst(self::CANDIDATES);
        self::assertSame(10, $picked['id']);
    }

    public function testOldestFirstTieBreaksByLowerId(): void
    {
        $sameInstant = [
            ['id' => 5, 'createdAt' => '2026-01-01 10:00:00'],
            ['id' => 3, 'createdAt' => '2026-01-01 10:00:00'],
        ];
        self::assertSame(3, Selection::oldestFirst($sameInstant)['id']);
    }

    public function testWeightedByAgeLowRngPicksOldest(): void
    {
        // r starts at 0, first subtraction (heaviest weight) drops below 0 -> index 0.
        $picked = Selection::weightedByAge(self::CANDIDATES, static fn (): float => 0.0);
        self::assertSame(10, $picked['id']); // oldest is the heaviest-weighted
    }

    public function testWeightedByAgeHighRngPicksYoungest(): void
    {
        // rng near 1 lands in the last (lightest) bucket -> youngest.
        $picked = Selection::weightedByAge(self::CANDIDATES, static fn (): float => 0.999);
        self::assertSame(30, $picked['id']);
    }

    public function testWeightedByAgeOldestIsMoreLikelyThanYoungest(): void
    {
        // Sweep the rng across [0,1); the oldest bucket must own more of the range
        // than the youngest (rank-based weights 3:2:1 for three candidates).
        $counts = [10 => 0, 20 => 0, 30 => 0];
        for ($i = 0; $i < 60; $i++) {
            $r = $i / 60;
            $picked = Selection::weightedByAge(self::CANDIDATES, static fn (): float => $r);
            $counts[$picked['id']]++;
        }
        self::assertGreaterThan($counts[30], $counts[10]);
        self::assertGreaterThan($counts[20], $counts[10]);
    }

    public function testUniformRandomIndexesByRng(): void
    {
        // After no sorting, uniformRandom indexes the list as-is: rng*count floored.
        self::assertSame(30, Selection::uniformRandom(self::CANDIDATES, static fn (): float => 0.0)['id']);
        self::assertSame(20, Selection::uniformRandom(self::CANDIDATES, static fn (): float => 0.999)['id']);
    }

    public function testUniformRandomClampsRngEqualToOne(): void
    {
        // The default rng (mt_rand()/mt_getrandmax()) can return exactly 1.0, which
        // would index one past the end — the index must clamp to the last element.
        $picked = Selection::uniformRandom(self::CANDIDATES, static fn (): float => 1.0);
        self::assertSame(20, $picked['id']); // last element of the (unsorted) list
    }

    public function testStrategiesMapExposesAllThree(): void
    {
        $names = array_keys(Selection::strategies());
        self::assertSame(['weightedByAge', 'oldestFirst', 'uniformRandom'], $names);
    }

    // --- #238 focusProject: least-effort project, oldest task within ---

    /** A candidate row as focusProject expects it (raw-ish DB shape). */
    private static function row(int $id, string $complexity, string $createdAt, int $projectId, string $projectCreatedAt): array
    {
        return [
            'id' => $id,
            'complexity' => $complexity,
            'created_at' => $createdAt,
            'project_id' => $projectId,
            'project_created_at' => $projectCreatedAt,
        ];
    }

    public function testFocusProjectEmptyReturnsNull(): void
    {
        self::assertNull(Selection::focusProject([], PointsConfig::BASE_POINTS));
    }

    public function testFocusProjectPicksLeastEffortProjectThenOldestTask(): void
    {
        $rows = [
            // Project 1: one high task → effort 10.
            self::row(1, 'high', '2026-01-01 10:00:00', 1, '2026-01-01 09:00:00'),
            // Project 2: two low tasks → effort 4 (closest to done). Oldest is id 21.
            self::row(20, 'low', '2026-01-05 10:00:00', 2, '2026-01-02 09:00:00'),
            self::row(21, 'low', '2026-01-04 10:00:00', 2, '2026-01-02 09:00:00'),
        ];
        $picked = Selection::focusProject($rows, PointsConfig::BASE_POINTS);
        self::assertSame(21, $picked['id']); // project 2 (least effort), its oldest task
    }

    public function testFocusProjectTieBreaksToOldestProject(): void
    {
        // Equal effort (2 each) → the older project (created earlier) wins.
        $rows = [
            self::row(30, 'low', '2026-01-05 10:00:00', 9, '2026-02-01 09:00:00'), // newer project
            self::row(31, 'low', '2026-01-05 10:00:00', 4, '2026-01-01 09:00:00'), // older project
        ];
        $picked = Selection::focusProject($rows, PointsConfig::BASE_POINTS);
        self::assertSame(31, $picked['id']); // task of the older project (id 4)
        self::assertSame(4, $picked['project_id']);
    }
}

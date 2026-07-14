<?php

declare(strict_types=1);

namespace Tests\Unit;

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
}

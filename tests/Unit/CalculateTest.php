<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Points\Calculate;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Tier-1 regression for the pure points math. These values encode PROJECT_SPEC
 * §7 (and PointsConfig's finalized constants); a formula change that drifts the
 * numbers must fail here.
 */
final class CalculateTest extends TestCase
{
    public function testBasePointsByComplexity(): void
    {
        self::assertSame(2, Calculate::basePointsFor('low'));
        self::assertSame(5, Calculate::basePointsFor('medium'));
        self::assertSame(10, Calculate::basePointsFor('high'));
    }

    /**
     * Speed bonus: 0 on/over estimate, +100% of base at <=50% of the estimate,
     * linear in between, and saturated (can't be farmed past 50% faster).
     *
     * @return array<string,array{int,int,?int,int}>
     */
    public static function speedBonusCases(): array
    {
        return [
            // base, estimated, actual, expected bonus
            'spec worked example: high, 30->15 = ceiling' => [10, 30, 15, 10],
            'exactly on estimate = 0'                     => [10, 30, 30, 0],
            'over estimate = 0'                           => [10, 30, 45, 0],
            'actual null (not tracked) = 0'               => [10, 30, null, 0],
            'zero estimate guards against /0 = 0'         => [10, 0, 5, 0],
            'saturation edge: exactly 50% = ceiling'      => [10, 40, 20, 10],
            'just under 50% still ceiling'                => [10, 40, 19, 10],
            'well under 50% saturates, no farming'        => [10, 30, 5, 10],
            'linear midpoint: 25% saved = half ceiling'   => [10, 40, 30, 5],
            'low base rounds: 25% saved of base 2'        => [2, 40, 30, 1],
            'medium base, 50% saved = +100%'              => [5, 20, 10, 5],
        ];
    }

    #[DataProvider('speedBonusCases')]
    public function testComputeSpeedBonus(int $base, int $estimated, ?int $actual, int $expected): void
    {
        self::assertSame($expected, Calculate::computeSpeedBonus($base, $estimated, $actual));
    }

    /**
     * Daily multiplier: 1 + (n-1)*0.15, capped at 2.0 — the cap is first reached
     * at the 8th completion of the day.
     *
     * @return array<string,array{int,float}>
     */
    public static function multiplierCases(): array
    {
        return [
            '1st task = 1.00'          => [1, 1.00],
            '2nd task = 1.15'          => [2, 1.15],
            '3rd task = 1.30'          => [3, 1.30],
            '7th task = 1.90 (< cap)'  => [7, 1.90],
            '8th task caps at 2.00'    => [8, 2.00],
            '20th task stays at cap'   => [20, 2.00],
            'n<=0 floors at 1.00'      => [0, 1.00],
        ];
    }

    #[DataProvider('multiplierCases')]
    public function testDailyMultiplier(int $n, float $expected): void
    {
        self::assertSame($expected, Calculate::dailyMultiplier($n));
    }

    public function testComputeTotalSpecWorkedExample(): void
    {
        // §7: high task (base 10), finished 50% early (speed 10), as the 3rd task
        // of the day (multiplier 1.30) => round((10 + 10) * 1.30) = 26.
        self::assertSame(26, Calculate::computeTotal(10, 10, 1.30));
    }

    public function testComputeTotalBaseline(): void
    {
        // No bonus, first task of the day: total == base.
        self::assertSame(2, Calculate::computeTotal(2, 0, 1.00));
        self::assertSame(10, Calculate::computeTotal(10, 0, 1.00));
    }

    public function testComputeTotalRoundsHalfUp(): void
    {
        // (5 + 0) * 1.15 = 5.75 -> 6.
        self::assertSame(6, Calculate::computeTotal(5, 0, 1.15));
    }
}

<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Points\Calculate;
use App\Points\PointsConfig;
use PHPUnit\Framework\TestCase;

/**
 * Pure math of the #383 points regulation (#292): estimate sanity bands, the
 * too-fast-to-score threshold, and the daily cap/budget verdicts. A constant
 * change that shifts the fairness rules must fail here.
 */
final class RegulationTest extends TestCase
{
    public function testEstimateClampsIntoTheComplexityBand(): void
    {
        // Low band 5–60: fantasy values on either side clamp; in-band passes.
        self::assertSame(5, Calculate::clampEstimate('low', 1));
        self::assertSame(30, Calculate::clampEstimate('low', 30));
        self::assertSame(60, Calculate::clampEstimate('low', 100000));

        // Medium 15–240, High 30–480.
        self::assertSame(15, Calculate::clampEstimate('medium', 1));
        self::assertSame(240, Calculate::clampEstimate('medium', 999));
        self::assertSame(30, Calculate::clampEstimate('high', 1));
        self::assertSame(480, Calculate::clampEstimate('high', 100000));
    }

    public function testClampedEstimateCapsTheSpeedBonusBasis(): void
    {
        // The exploit this kills: High with a 100,000-min estimate finished in
        // 2 min. Against the raw estimate that's a full +100% bonus; against
        // the clamped 480 it still saturates — but the CLAMP is what the award
        // path feeds, so the bonus can never exceed the band's honest maximum
        // (and the daily budget charges 480 claimed minutes, not 2).
        $base = Calculate::basePointsFor('high');
        $clamped = Calculate::clampEstimate('high', 100000);
        self::assertSame(480, $clamped);
        self::assertSame($base, Calculate::computeSpeedBonus($base, $clamped, 2));
    }

    public function testTooFastThreshold(): void
    {
        self::assertTrue(Calculate::tooFastToScore(0));
        self::assertTrue(Calculate::tooFastToScore(59));
        self::assertFalse(Calculate::tooFastToScore(60));
        self::assertFalse(Calculate::tooFastToScore(3600));
    }

    public function testDailyLimitVerdicts(): void
    {
        $cap = PointsConfig::DAILY_COMPLETIONS_CAP;
        $budget = PointsConfig::DAILY_BUDGET_MINUTES;

        // Under both limits: scores.
        self::assertNull(Calculate::dailyLimitReason(0, 0));
        self::assertNull(Calculate::dailyLimitReason($cap - 1, $budget - 1));

        // At the count cap: the cap wins (checked first, most specific).
        self::assertSame('daily_cap', Calculate::dailyLimitReason($cap, 0));
        self::assertSame('daily_cap', Calculate::dailyLimitReason($cap, $budget));

        // Budget full: no more scoring even with count room.
        self::assertSame('daily_budget', Calculate::dailyLimitReason(0, $budget));
        self::assertSame('daily_budget', Calculate::dailyLimitReason(1, $budget + 500));
    }
}

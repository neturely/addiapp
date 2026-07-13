<?php

declare(strict_types=1);

namespace App\Points;

/** Pure gamification math — no DB, no side effects (ports points/calculate.ts). */
final class Calculate
{
    public static function basePointsFor(string $complexity): int
    {
        return PointsConfig::BASE_POINTS[$complexity];
    }

    /** Speed bonus in points. 0 unless finished faster than estimated. */
    public static function computeSpeedBonus(int $basePoints, int $estimatedMinutes, ?int $actualMinutes): int
    {
        if ($actualMinutes === null || $estimatedMinutes <= 0 || $actualMinutes >= $estimatedMinutes) {
            return 0;
        }
        $saved = min(max(($estimatedMinutes - $actualMinutes) / $estimatedMinutes, 0.0), 1.0);
        $effective = min($saved / PointsConfig::SPEED_BONUS_SATURATION, 1.0);
        return (int) round($basePoints * PointsConfig::SPEED_BONUS_MAX_RATIO * $effective);
    }

    /** Multiplier for the n-th completed task of the day (n is 1-based). */
    public static function dailyMultiplier(int $n): float
    {
        $raw = 1 + max(0, $n - 1) * PointsConfig::DAILY_MULTIPLIER_GROWTH;
        return min(round($raw * 100) / 100, PointsConfig::DAILY_MULTIPLIER_CAP);
    }

    public static function computeTotal(int $basePoints, int $speedBonus, float $multiplier): int
    {
        return (int) round(($basePoints + $speedBonus) * $multiplier);
    }
}

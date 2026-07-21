<?php

declare(strict_types=1);

namespace App\Points;

use App\Config;

/**
 * The ONLY place the gamification numbers live (matches server/src/points/config.ts).
 * Tuning these never touches the calculation logic.
 */
final class PointsConfig
{
    /** Base points by complexity. */
    public const BASE_POINTS = ['low' => 2, 'medium' => 5, 'high' => 10];

    /** Speed bonus: ceiling as a fraction of base (1.0 = up to +100%). */
    public const SPEED_BONUS_MAX_RATIO = 1.0;
    /** Time-saved fraction at which the ceiling is reached (0.5 = half the estimate). */
    public const SPEED_BONUS_SATURATION = 0.5;

    /** Daily multiplier grows +0.15/task, capped at 2.0 (reached at the 8th task/day). */
    public const DAILY_MULTIPLIER_GROWTH = 0.15;
    public const DAILY_MULTIPLIER_CAP = 2.0;

    /**
     * Project-completion bonus (#240): awarded ONCE when every task of a project
     * (≥1 task) is done. Size-scaled so a bigger project pays more, floored so any
     * completion feels rewarding, and capped so a huge project can't run away.
     * bonus = clamp(round(Σ base points × RATIO), MIN, MAX). All three are here
     * because this file is the single source for gamification numbers — tune freely.
     */
    public const PROJECT_BONUS_RATIO = 0.5;
    public const PROJECT_BONUS_MIN = 10;
    public const PROJECT_BONUS_MAX = 100;

    public static function timezone(): string
    {
        return (string) Config::get('appTimezone');
    }
}

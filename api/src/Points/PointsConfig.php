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

    /**
     * Points-integrity regulation (#292/#383) — the score must survive a future
     * multi-user leaderboard, so the award path stops trusting user-controlled
     * inputs at the edges. ONE regulated score (no dual ledger, decided #292).
     */

    /** Estimate sanity bands per complexity, minutes — SCORING only (the task
     *  field still accepts 1–100,000): bonus/budget math clamps into these so
     *  fantasy estimates stop inflating anything. */
    public const ESTIMATE_BANDS = [
        'low' => [5, 60],
        'medium' => [15, 240],
        'high' => [30, 480],
    ];

    /** Completions with less elapsed time than this score 0 (base included).
     *  Elapsed = start→done, or created→done when completed straight from
     *  Ready — so untimed one-click dones and mass-created insta-completes
     *  can't mint points. */
    public const MIN_SCORING_MINUTES = 1;

    /** "A day can only hold a day": once today's scored completions claim this
     *  many (clamped-estimate) minutes, further completions score 0. */
    public const DAILY_BUDGET_MINUTES = 720;

    /** Volume guard the budget can't provide (many tiny tasks): points for the
     *  first N scored completions per day, 0 after. */
    public const DAILY_COMPLETIONS_CAP = 25;

    /** The #240 project bonus requires at least this many (non-recurring)
     *  tasks — throwaway one-task projects pay nothing. */
    public const PROJECT_BONUS_MIN_TASKS = 3;

    public static function timezone(): string
    {
        return (string) Config::get('appTimezone');
    }
}

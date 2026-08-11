<?php

declare(strict_types=1);

namespace App\Points;

use App\Db;
use App\Notifications\Notifications;
use PDO;
use PDOException;

/** Award orchestration + stats aggregation (ports points/award.ts). */
final class Award
{
    /** Current calendar date (Y-m-d) in the configured timezone. */
    private static function todayInTz(): string
    {
        return (new \DateTimeImmutable('now', new \DateTimeZone(PointsConfig::timezone())))->format('Y-m-d');
    }

    private static function prevDate(string $date): string
    {
        return (new \DateTimeImmutable($date, new \DateTimeZone('UTC')))->modify('-1 day')->format('Y-m-d');
    }

    /**
     * Award points for a completed task. Idempotent per task — awarded exactly
     * once, even under a concurrent double-complete (UNIQUE(task_id) is the gate).
     * Takes the freshly reloaded task row (needs created/started/completed
     * timestamps + bonus_forfeited for the #383 regulation). Returns the
     * breakdown — with a `reason` when the regulation zeroed it — or null if
     * already awarded.
     *
     * Regulation (#292/#383, ONE regulated score):
     *  - elapsed < MIN_SCORING_MINUTES ⇒ 0 points (`too_fast`) — elapsed runs
     *    from the start, or from creation when completed straight from Ready;
     *  - past DAILY_COMPLETIONS_CAP scored completions, or once claimed minutes
     *    reach DAILY_BUDGET_MINUTES ⇒ 0 points (`daily_cap`/`daily_budget`);
     *  - a forfeited task (re-armed timer, #383) earns base × multiplier, no
     *    speed bonus; the bonus itself is measured against the CLAMPED estimate.
     * A zeroed award still inserts its points_log row (totals 0) so the
     * UNIQUE(task_id) once-ever gate — and the #250 recurring spawn riding the
     * insert win — keep working; zeroed completions do NOT advance daily_stats
     * (no multiplier pumping via free instant tasks, no claimed minutes).
     *
     * @param array<string,mixed> $task
     * @return array{basePoints:int,speedBonus:int,multiplier:float,totalPoints:int,reason?:string}|null
     */
    public static function awardTaskCompletion(array $task): ?array
    {
        $pdo = Db::pdo();
        $taskId = (int) $task['id'];
        $userId = (int) $task['user_id'];

        $pre = $pdo->prepare('SELECT id FROM points_log WHERE task_id = ? LIMIT 1');
        $pre->execute([$taskId]);
        if ($pre->fetch() !== false) {
            return null;
        }

        $today = self::todayInTz();
        $s = $pdo->prepare(
            'SELECT tasks_completed, claimed_minutes FROM daily_stats WHERE user_id = ? AND stat_date = ? LIMIT 1',
        );
        $s->execute([$userId, $today]);
        $prior = $s->fetch();
        $priorCount = $prior !== false ? (int) $prior['tasks_completed'] : 0;
        $priorClaimed = $prior !== false ? (int) $prior['claimed_minutes'] : 0;

        // Too fast to score, or the day is full? The award is recorded at 0.
        $reason = Calculate::tooFastToScore(self::elapsedSeconds($task))
            ? 'too_fast'
            : Calculate::dailyLimitReason($priorCount, $priorClaimed);
        if ($reason !== null) {
            try {
                $pdo->prepare(
                    'INSERT INTO points_log (user_id, task_id, base_points, speed_bonus, multiplier, total_points)
                     VALUES (?, ?, 0, 0, \'1.00\', 0)',
                )->execute([$userId, $taskId]);
            } catch (PDOException $e) {
                if ($e->getCode() === '23000') {
                    return null; // lost the race — already awarded
                }
                throw $e;
            }
            return ['basePoints' => 0, 'speedBonus' => 0, 'multiplier' => 1.0, 'totalPoints' => 0, 'reason' => $reason];
        }

        $basePoints = Calculate::basePointsFor((string) $task['complexity']);
        $clampedEstimate = Calculate::clampEstimate((string) $task['complexity'], (int) $task['estimated_minutes']);
        $actualMinutes = $task['actual_minutes'] !== null ? (int) $task['actual_minutes'] : null;
        // One-shot sprint reward (#383): a re-armed task forfeited its bonus.
        $speedBonus = ((int) ($task['bonus_forfeited'] ?? 0)) === 1
            ? 0
            : Calculate::computeSpeedBonus($basePoints, $clampedEstimate, $actualMinutes);

        $n = $priorCount + 1;
        $multiplier = Calculate::dailyMultiplier($n);
        $totalPoints = Calculate::computeTotal($basePoints, $speedBonus, $multiplier);
        $liveMultiplier = Calculate::dailyMultiplier($n + 1); // what the *next* completion earns

        // Race-safe: the UNIQUE(task_id) makes this insert the single winner.
        try {
            $pdo->prepare(
                'INSERT INTO points_log (user_id, task_id, base_points, speed_bonus, multiplier, total_points)
                 VALUES (?, ?, ?, ?, ?, ?)',
            )->execute([$userId, $taskId, $basePoints, $speedBonus, number_format($multiplier, 2, '.', ''), $totalPoints]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                return null; // lost the race — already awarded
            }
            throw $e;
        }

        // NOTE (TECH-2): `daily_stats.multiplier` stores $liveMultiplier — the
        // multiplier the *next* completion will earn — NOT the one applied to the
        // completion just recorded. It's a live preview for the UI (the points card
        // shows "your next task earns ×N"). The multiplier actually applied to THIS
        // completion is persisted per-row in `points_log.multiplier` above. So a
        // reader inspecting daily_stats will see a value one step ahead of the last
        // award; that's intentional, not a bug.
        $pdo->prepare(
            'INSERT INTO daily_stats (user_id, stat_date, tasks_completed, points_earned, multiplier, claimed_minutes)
             VALUES (?, ?, 1, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               tasks_completed = tasks_completed + 1,
               points_earned = points_earned + ?,
               multiplier = ?,
               claimed_minutes = claimed_minutes + ?',
        )->execute([
            $userId,
            $today,
            $totalPoints,
            number_format($liveMultiplier, 2, '.', ''),
            $clampedEstimate,
            $totalPoints,
            number_format($liveMultiplier, 2, '.', ''),
            $clampedEstimate,
        ]);

        return [
            'basePoints' => $basePoints,
            'speedBonus' => $speedBonus,
            'multiplier' => $multiplier,
            'totalPoints' => $totalPoints,
        ];
    }

    /**
     * Seconds a completion actually took (#383): completed − started, or
     * completed − created when the task was never started (a straight-from-
     * Ready one-click done must not dodge the too-fast rule). Timestamps are
     * same-clock DB DATETIMEs, so the diff is timezone-agnostic.
     */
    private static function elapsedSeconds(array $task): int
    {
        $from = $task['started_at'] ?? $task['created_at'];
        $to = $task['completed_at'];
        if (!is_string($from) || !is_string($to)) {
            return 0; // missing timing data can never look "slow enough" by accident
        }
        return max(0, strtotime($to) - strtotime($from));
    }

    /**
     * Award the project-completion bonus (#240) when an ACTIVE project the user
     * owns has ≥1 task and every task is done. Idempotent — awarded exactly once
     * ever per project (UNIQUE(project_id) on points_log is the gate, mirroring the
     * per-task #74 invariant). Base points come from PointsConfig (never hardcoded).
     * Returns the bonus + project name, or null (not complete / empty / already
     * awarded / not an active owned project).
     *
     * @return array{projectId:int,name:string,bonus:int}|null
     */
    public static function awardProjectCompletion(int $projectId, int $userId): ?array
    {
        $pdo = Db::pdo();

        // Active + owned, else it can't complete.
        $p = $pdo->prepare("SELECT name FROM projects WHERE id = ? AND user_id = ? AND status = 'active' LIMIT 1");
        $p->execute([$projectId, $userId]);
        $name = $p->fetchColumn();
        if ($name === false) {
            return null;
        }

        // Cheap pre-check (the UNIQUE index is the real guard against the race).
        $pre = $pdo->prepare('SELECT id FROM points_log WHERE project_id = ? LIMIT 1');
        $pre->execute([$projectId]);
        if ($pre->fetch() !== false) {
            return null; // already awarded
        }

        // Task tallies + remaining-effort basis, grouped so base points stay in
        // PointsConfig (not baked into SQL). Recurring tasks (#250) are excluded
        // from the all-done check AND the bonus basis — a rule-carrying task
        // never finishes (each completion spawns the next occurrence), so
        // counting it would make its project's bonus unreachable.
        $g = $pdo->prepare(
            "SELECT complexity, COUNT(*) AS c, SUM(status = 'done') AS done_c
             FROM tasks WHERE project_id = ? AND user_id = ?
               AND recur_unit IS NULL AND recur_day_of_month IS NULL
             GROUP BY complexity",
        );
        $g->execute([$projectId, $userId]);
        $total = 0;
        $done = 0;
        $sumBase = 0;
        foreach ($g->fetchAll() as $row) {
            $c = (int) $row['c'];
            $total += $c;
            $done += (int) $row['done_c'];
            $sumBase += ($c * (PointsConfig::BASE_POINTS[$row['complexity']] ?? 0));
        }
        // #383: throwaway projects pay nothing — the bonus needs a real project.
        if ($total < PointsConfig::PROJECT_BONUS_MIN_TASKS || $done < $total) {
            return null; // too small, empty, or not yet complete
        }

        $bonus = (int) round($sumBase * PointsConfig::PROJECT_BONUS_RATIO);
        $bonus = max(PointsConfig::PROJECT_BONUS_MIN, min(PointsConfig::PROJECT_BONUS_MAX, $bonus));

        // Award-once: UNIQUE(project_id) makes this the single winner under a race.
        try {
            $pdo->prepare(
                'INSERT INTO points_log (user_id, task_id, project_id, base_points, speed_bonus, multiplier, total_points)
                 VALUES (?, NULL, ?, ?, 0, \'1.00\', ?)',
            )->execute([$userId, $projectId, $bonus, $bonus]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                return null; // lost the race — already awarded
            }
            throw $e;
        }

        // Reflect the bonus in today's points (not a task, so tasks_completed and the
        // multiplier are untouched). The triggering task's award already created the row.
        $pdo->prepare(
            "INSERT INTO daily_stats (user_id, stat_date, tasks_completed, points_earned, multiplier)
             VALUES (?, ?, 0, ?, '1.00')
             ON DUPLICATE KEY UPDATE points_earned = points_earned + ?",
        )->execute([$userId, self::todayInTz(), $bonus, $bonus]);

        return ['projectId' => $projectId, 'name' => (string) $name, 'bonus' => $bonus];
    }

    /** Lean summary for the dashboard card / GET /api/points. */
    public static function getPointsStats(int $userId): array
    {
        $pdo = Db::pdo();

        $t = $pdo->prepare('SELECT COALESCE(SUM(total_points), 0) FROM points_log WHERE user_id = ?');
        $t->execute([$userId]);
        $total = (int) $t->fetchColumn();

        $today = self::todayInTz();
        $s = $pdo->prepare('SELECT tasks_completed, points_earned FROM daily_stats WHERE user_id = ? AND stat_date = ? LIMIT 1');
        $s->execute([$userId, $today]);
        $row = $s->fetch();
        $tasksCompleted = $row !== false ? (int) $row['tasks_completed'] : 0;
        $pointsEarned = $row !== false ? (int) $row['points_earned'] : 0;

        return [
            'total' => $total,
            'today' => [
                'date' => $today,
                'tasksCompleted' => $tasksCompleted,
                'pointsEarned' => $pointsEarned,
                'currentMultiplier' => Calculate::dailyMultiplier($tasksCompleted + 1),
            ],
            'basePoints' => PointsConfig::BASE_POINTS,
            // Speed-bonus config (#262): the task view's points-forecast panel
            // renders "up to +N inside M minutes" from these — served, never
            // hardcoded client-side (PointsConfig is the single source).
            'speedBonus' => [
                'maxRatio' => PointsConfig::SPEED_BONUS_MAX_RATIO,
                'saturation' => PointsConfig::SPEED_BONUS_SATURATION,
            ],
            // Fair-play limits (#383): the "How points work" page (#385)
            // renders every number from here — served, never hardcoded.
            'limits' => [
                'estimateBands' => PointsConfig::ESTIMATE_BANDS,
                'minScoringMinutes' => PointsConfig::MIN_SCORING_MINUTES,
                'dailyBudgetMinutes' => PointsConfig::DAILY_BUDGET_MINUTES,
                'dailyCompletionsCap' => PointsConfig::DAILY_COMPLETIONS_CAP,
                'projectBonus' => [
                    'ratio' => PointsConfig::PROJECT_BONUS_RATIO,
                    'min' => PointsConfig::PROJECT_BONUS_MIN,
                    'max' => PointsConfig::PROJECT_BONUS_MAX,
                    'minTasks' => PointsConfig::PROJECT_BONUS_MIN_TASKS,
                ],
                // Overrun thresholds (#403): the InProgress screen's past-the-
                // estimate copy counts down to the auto-return off these.
                'overrun' => [
                    'warnRatio' => Notifications::OVERRUN_WARN_RATIO,
                    'returnRatio' => Notifications::OVERRUN_RETURN_RATIO,
                ],
            ],
        ];
    }

    /** Richer lifetime stats for GET /api/points/stats (incl. day streak). */
    public static function getUserStats(int $userId): array
    {
        $pdo = Db::pdo();

        $agg = $pdo->prepare(
            'SELECT COALESCE(SUM(total_points), 0) AS total, COUNT(*) AS tasks, COALESCE(SUM(speed_bonus), 0) AS speed
             FROM points_log WHERE user_id = ?',
        );
        $agg->execute([$userId]);
        $a = $agg->fetch();

        $today = self::todayInTz();
        $tr = $pdo->prepare('SELECT tasks_completed, points_earned FROM daily_stats WHERE user_id = ? AND stat_date = ? LIMIT 1');
        $tr->execute([$userId, $today]);
        $trow = $tr->fetch();
        $tasksToday = $trow !== false ? (int) $trow['tasks_completed'] : 0;
        $pointsToday = $trow !== false ? (int) $trow['points_earned'] : 0;

        // Streak: walk back over active dates; if today isn't active yet, start
        // from yesterday so a fresh day doesn't zero the streak.
        $dr = $pdo->prepare('SELECT stat_date FROM daily_stats WHERE user_id = ? AND tasks_completed > 0');
        $dr->execute([$userId]);
        $active = array_flip($dr->fetchAll(PDO::FETCH_COLUMN));
        $cursor = isset($active[$today]) ? $today : self::prevDate($today);
        $streak = 0;
        while (isset($active[$cursor])) {
            $streak++;
            $cursor = self::prevDate($cursor);
        }

        return [
            'total' => (int) $a['total'],
            'lifetime' => [
                'tasksCompleted' => (int) $a['tasks'],
                'speedBonusTotal' => (int) $a['speed'],
            ],
            'today' => [
                'date' => $today,
                'tasksCompleted' => $tasksToday,
                'pointsEarned' => $pointsToday,
                'currentMultiplier' => Calculate::dailyMultiplier($tasksToday + 1),
            ],
            'streak' => ['currentDays' => $streak],
            // Multiplier config (#260): the right-column Today panel renders the
            // "×CAP at task N" progress track from these — served, never
            // hardcoded client-side (PointsConfig is the single source).
            'multiplier' => [
                'cap' => PointsConfig::DAILY_MULTIPLIER_CAP,
                'capTaskNumber' => self::multiplierCapTaskNumber(),
            ],
        ];
    }

    /** The n-th completion of the day at which the daily multiplier hits its cap. */
    private static function multiplierCapTaskNumber(): int
    {
        return (int) ceil(
            (PointsConfig::DAILY_MULTIPLIER_CAP - 1) / PointsConfig::DAILY_MULTIPLIER_GROWTH,
        ) + 1;
    }
}

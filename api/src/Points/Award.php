<?php

declare(strict_types=1);

namespace App\Points;

use App\Db;
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
     * Returns the breakdown, or null if already awarded.
     *
     * @return array{basePoints:int,speedBonus:int,multiplier:float,totalPoints:int}|null
     */
    public static function awardTaskCompletion(
        int $taskId,
        int $userId,
        string $complexity,
        int $estimatedMinutes,
        ?int $actualMinutes,
    ): ?array {
        $pdo = Db::pdo();

        $pre = $pdo->prepare('SELECT id FROM points_log WHERE task_id = ? LIMIT 1');
        $pre->execute([$taskId]);
        if ($pre->fetch() !== false) {
            return null;
        }

        $basePoints = Calculate::basePointsFor($complexity);
        $speedBonus = Calculate::computeSpeedBonus($basePoints, $estimatedMinutes, $actualMinutes);

        $today = self::todayInTz();
        $s = $pdo->prepare('SELECT tasks_completed FROM daily_stats WHERE user_id = ? AND stat_date = ? LIMIT 1');
        $s->execute([$userId, $today]);
        $priorCount = (int) ($s->fetchColumn() ?: 0);
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
            'INSERT INTO daily_stats (user_id, stat_date, tasks_completed, points_earned, multiplier)
             VALUES (?, ?, 1, ?, ?)
             ON DUPLICATE KEY UPDATE
               tasks_completed = tasks_completed + 1,
               points_earned = points_earned + ?,
               multiplier = ?',
        )->execute([
            $userId,
            $today,
            $totalPoints,
            number_format($liveMultiplier, 2, '.', ''),
            $totalPoints,
            number_format($liveMultiplier, 2, '.', ''),
        ]);

        return [
            'basePoints' => $basePoints,
            'speedBonus' => $speedBonus,
            'multiplier' => $multiplier,
            'totalPoints' => $totalPoints,
        ];
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
        // PointsConfig (not baked into SQL).
        $g = $pdo->prepare(
            "SELECT complexity, COUNT(*) AS c, SUM(status = 'done') AS done_c
             FROM tasks WHERE project_id = ? AND user_id = ? GROUP BY complexity",
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
        if ($total === 0 || $done < $total) {
            return null; // empty, or not yet complete
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
        ];
    }
}

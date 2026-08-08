<?php

declare(strict_types=1);

namespace Tests\Db;

use App\Auth\Sessions;
use App\Controllers\TasksController;
use App\Http\Request;
use App\Http\Router;
use App\Points\PointsConfig;

/**
 * Request-level integration for the #383 points regulation (#292): the award
 * path stops trusting user-controlled inputs — too-fast completions score 0,
 * a re-armed timer forfeits the speed bonus, the daily cap/budget zero the
 * day's overflow, and none of it breaks the recurring spawn or the once-ever
 * ledger invariants. Driven through the real router + TasksController.
 */
final class PointsRegulationTest extends DbTestCase
{
    private function router(): Router
    {
        $tasks = new TasksController();
        $router = new Router();
        $router->patch('/api/tasks/{id}', [$tasks, 'update'], true);
        return $router;
    }

    /**
     * @param array<string,mixed> $body
     * @return array{0:int,1:array<string,mixed>}
     */
    private function dispatch(string $method, string $path, string $sid, array $body = []): array
    {
        $req = new Request($method, $path, [], $body, ['sid' => $sid]);
        http_response_code(200);
        ob_start();
        try {
            $this->router()->dispatch($req);
            $out = ob_get_clean();
        } catch (\Throwable $e) {
            ob_end_clean();
            throw $e;
        }
        $decoded = json_decode((string) $out, true);
        return [http_response_code(), is_array($decoded) ? $decoded : []];
    }

    /** @return array{0:int,1:array<string,mixed>} */
    private function complete(int $taskId, string $sid): array
    {
        return $this->dispatch('PATCH', "/api/tasks/{$taskId}", $sid, ['status' => 'done']);
    }

    // --- too-fast rule ---

    public function testFreshTaskCompletedFromReadyScoresZeroWithReason(): void
    {
        $userId = $this->makeUser('reg-fast@test.local');
        $sid = Sessions::create($userId);
        // Created seconds ago, never started, one-click done — the untimed
        // loophole: elapsed runs from created_at, so it's too fast to score.
        $taskId = $this->makeTask($userId, 'high', 30);

        [$status, $body] = $this->complete($taskId, $sid);

        self::assertSame(200, $status);
        self::assertSame(0, $body['pointsAwarded']['totalPoints']);
        self::assertSame('too_fast', $body['pointsAwarded']['reason']);

        // The zero award still owns the once-ever slot…
        $log = $this->pdo->prepare('SELECT total_points FROM points_log WHERE task_id = ?');
        $log->execute([$taskId]);
        self::assertSame(0, (int) $log->fetchColumn());
        // …and does NOT advance the day (no multiplier pumping via free tasks).
        $ds = $this->pdo->prepare('SELECT COUNT(*) FROM daily_stats WHERE user_id = ?');
        $ds->execute([$userId]);
        self::assertSame(0, (int) $ds->fetchColumn());
    }

    public function testBackdatedTaskScoresNormallyAndChargesClampedMinutes(): void
    {
        $userId = $this->makeUser('reg-normal@test.local');
        $sid = Sessions::create($userId);
        // Estimate 1 is below the low band — scoring clamps it to 5 and the
        // day is charged 5 claimed minutes, not 1.
        $taskId = $this->makeTask($userId, 'low', 1);
        $this->backdateTask($taskId);

        [, $body] = $this->complete($taskId, $sid);

        self::assertSame(2, $body['pointsAwarded']['basePoints']);
        self::assertSame(2, $body['pointsAwarded']['totalPoints']);
        self::assertArrayNotHasKey('reason', $body['pointsAwarded']);

        $ds = $this->pdo->prepare('SELECT tasks_completed, claimed_minutes FROM daily_stats WHERE user_id = ?');
        $ds->execute([$userId]);
        $row = $ds->fetch();
        self::assertSame(1, (int) $row['tasks_completed']);
        self::assertSame(5, (int) $row['claimed_minutes']);
    }

    // --- one-shot sprint reward (re-arm forfeits the bonus) ---

    public function testReArmedTaskForfeitsTheSpeedBonusForGood(): void
    {
        $userId = $this->makeUser('reg-forfeit@test.local');
        $sid = Sessions::create($userId);
        $taskId = $this->makeTask($userId, 'high', 30);
        $this->backdateTask($taskId);

        // Start → back to Ready: the sticky flag is set…
        $this->dispatch('PATCH', "/api/tasks/{$taskId}", $sid, ['status' => 'in_progress']);
        $this->dispatch('PATCH', "/api/tasks/{$taskId}", $sid, ['status' => 'backlog']);
        $f = $this->pdo->prepare('SELECT bonus_forfeited FROM tasks WHERE id = ?');
        $f->execute([$taskId]);
        self::assertSame(1, (int) $f->fetchColumn());

        // …restart with a "perfect sprint" on the fresh clock (5 of 30 min —
        // full bonus territory if the forfeit didn't hold)…
        $this->dispatch('PATCH', "/api/tasks/{$taskId}", $sid, ['status' => 'in_progress']);
        $this->pdo->prepare('UPDATE tasks SET started_at = DATE_SUB(NOW(), INTERVAL 5 MINUTE) WHERE id = ?')
            ->execute([$taskId]);
        [, $body] = $this->complete($taskId, $sid);

        // …but only base × multiplier pays: the bonus is gone for good.
        self::assertSame(10, $body['pointsAwarded']['basePoints']);
        self::assertSame(0, $body['pointsAwarded']['speedBonus']);
        self::assertSame(10, $body['pointsAwarded']['totalPoints']);
    }

    public function testUninterruptedSprintStillEarnsTheBonus(): void
    {
        // Control for the forfeit test: the identical sprint WITHOUT the
        // re-arm pays the full bonus.
        $userId = $this->makeUser('reg-sprint@test.local');
        $sid = Sessions::create($userId);
        $taskId = $this->makeTask($userId, 'high', 30);
        $this->backdateTask($taskId);

        $this->dispatch('PATCH', "/api/tasks/{$taskId}", $sid, ['status' => 'in_progress']);
        $this->pdo->prepare('UPDATE tasks SET started_at = DATE_SUB(NOW(), INTERVAL 5 MINUTE) WHERE id = ?')
            ->execute([$taskId]);
        [, $body] = $this->complete($taskId, $sid);

        self::assertSame(10, $body['pointsAwarded']['speedBonus']);
        self::assertSame(20, $body['pointsAwarded']['totalPoints']);
    }

    // --- daily limits ---

    public function testCompletionPastTheDailyCountCapScoresZero(): void
    {
        $userId = $this->makeUser('reg-cap@test.local');
        $sid = Sessions::create($userId);
        $this->pdo->prepare(
            "INSERT INTO daily_stats (user_id, stat_date, tasks_completed, points_earned, multiplier, claimed_minutes)
             VALUES (?, CURDATE(), ?, 100, '2.00', 100)",
        )->execute([$userId, PointsConfig::DAILY_COMPLETIONS_CAP]);

        $taskId = $this->makeTask($userId, 'medium', 20);
        $this->backdateTask($taskId);
        [, $body] = $this->complete($taskId, $sid);

        self::assertSame(0, $body['pointsAwarded']['totalPoints']);
        self::assertSame('daily_cap', $body['pointsAwarded']['reason']);
        // The zeroed completion doesn't grow the day's tallies.
        $ds = $this->pdo->prepare('SELECT tasks_completed, claimed_minutes FROM daily_stats WHERE user_id = ?');
        $ds->execute([$userId]);
        $row = $ds->fetch();
        self::assertSame(PointsConfig::DAILY_COMPLETIONS_CAP, (int) $row['tasks_completed']);
        self::assertSame(100, (int) $row['claimed_minutes']);
    }

    public function testCompletionPastTheDailyBudgetScoresZero(): void
    {
        $userId = $this->makeUser('reg-budget@test.local');
        $sid = Sessions::create($userId);
        $this->pdo->prepare(
            "INSERT INTO daily_stats (user_id, stat_date, tasks_completed, points_earned, multiplier, claimed_minutes)
             VALUES (?, CURDATE(), 3, 100, '1.45', ?)",
        )->execute([$userId, PointsConfig::DAILY_BUDGET_MINUTES]);

        $taskId = $this->makeTask($userId, 'medium', 20);
        $this->backdateTask($taskId);
        [, $body] = $this->complete($taskId, $sid);

        self::assertSame(0, $body['pointsAwarded']['totalPoints']);
        self::assertSame('daily_budget', $body['pointsAwarded']['reason']);
    }

    // --- project-bonus interplay (#391 review) ---

    public function testZeroedCompletionDoesNotMintTheProjectBonus(): void
    {
        // Finishing a project's last task while the day is capped must not pay
        // the #240 bonus (project churn would leak points past the limits) —
        // but the bonus is once-ever, not lost: a re-complete on an uncapped
        // day (award null → no reason) runs the check and pays it.
        $userId = $this->makeUser('reg-proj@test.local');
        $sid = Sessions::create($userId);
        $this->pdo->prepare('INSERT INTO projects (user_id, name) VALUES (?, ?)')->execute([$userId, 'Capped']);
        $projectId = (int) $this->pdo->lastInsertId();
        $ids = [];
        for ($i = 0; $i < PointsConfig::PROJECT_BONUS_MIN_TASKS; $i++) {
            $t = $this->makeTask($userId, 'low', 5);
            $this->backdateTask($t);
            $this->pdo->prepare('UPDATE tasks SET project_id = ? WHERE id = ?')->execute([$projectId, $t]);
            $ids[] = $t;
        }
        $this->dispatch('PATCH', "/api/tasks/{$ids[0]}", $sid, ['status' => 'done']);
        $this->dispatch('PATCH', "/api/tasks/{$ids[1]}", $sid, ['status' => 'done']);

        // Cap the day, then complete the last task: zeroed award, NO bonus.
        $this->pdo->prepare('UPDATE daily_stats SET tasks_completed = ? WHERE user_id = ?')
            ->execute([PointsConfig::DAILY_COMPLETIONS_CAP, $userId]);
        [, $body] = $this->dispatch('PATCH', "/api/tasks/{$ids[2]}", $sid, ['status' => 'done']);
        self::assertSame('daily_cap', $body['pointsAwarded']['reason']);
        self::assertArrayNotHasKey('projectCompleted', $body);

        // Recovery: reopen + re-complete once the day is clear — the task
        // award is a no-op (already logged) but the once-ever bonus pays now.
        $this->pdo->prepare('DELETE FROM daily_stats WHERE user_id = ?')->execute([$userId]);
        $this->dispatch('PATCH', "/api/tasks/{$ids[2]}", $sid, ['status' => 'backlog']);
        [, $again] = $this->dispatch('PATCH', "/api/tasks/{$ids[2]}", $sid, ['status' => 'done']);
        self::assertArrayNotHasKey('pointsAwarded', $again);
        self::assertSame($projectId, $again['projectCompleted']['projectId']);
    }

    // --- recurring interplay ---

    public function testZeroedAwardStillSpawnsTheRecurringClone(): void
    {
        // The #250 spawn gate rides the points_log insert WIN, not the score —
        // a too-fast completion of a recurring task must still come back, and
        // the clone starts with a fresh (unforfeited) bonus.
        $userId = $this->makeUser('reg-recur@test.local');
        $sid = Sessions::create($userId);
        $taskId = $this->makeTask($userId, 'low', 10);
        $this->pdo->prepare("UPDATE tasks SET recur_unit = 'day', recur_interval = 1, bonus_forfeited = 1 WHERE id = ?")
            ->execute([$taskId]);

        [, $body] = $this->complete($taskId, $sid); // fresh ⇒ too_fast ⇒ 0

        self::assertSame('too_fast', $body['pointsAwarded']['reason']);
        self::assertArrayHasKey('recursAt', $body);
        $clone = $this->pdo->prepare(
            "SELECT bonus_forfeited FROM tasks WHERE user_id = ? AND status = 'backlog' AND recur_unit = 'day' AND id <> ?",
        );
        $clone->execute([$userId, $taskId]);
        $flag = $clone->fetchColumn();
        self::assertNotFalse($flag, 'the clone must spawn despite the zero award');
        self::assertSame(0, (int) $flag, 'the clone starts with a fresh bonus');
    }
}

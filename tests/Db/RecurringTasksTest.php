<?php

declare(strict_types=1);

namespace Tests\Db;

use App\Auth\Sessions;
use App\Controllers\TasksController;
use App\Http\Request;
use App\Http\Router;

/**
 * Recurring tasks + snooze until (#250), request-level: availableFrom /
 * recurrence validation, the Play availability cutoff, clone-per-occurrence on
 * the completing PATCH (with the recursAt rider + no-respawn on reopen), and
 * the recurring exclusion from the #240 bonus / #310 auto-done checks.
 */
final class RecurringTasksTest extends DbTestCase
{
    private function router(): Router
    {
        $tasks = new TasksController();
        $router = new Router();
        $router->get('/api/tasks', [$tasks, 'index'], true);
        $router->get('/api/tasks/next', [$tasks, 'next'], true);
        $router->post('/api/tasks', [$tasks, 'create'], true);
        $router->patch('/api/tasks/{id}', [$tasks, 'update'], true);
        return $router;
    }

    /**
     * @param array<string,mixed> $body
     * @param array<string,mixed> $query
     * @return array{0:int,1:array<string,mixed>}
     */
    private function dispatch(string $method, string $path, string $sid, array $body = [], array $query = []): array
    {
        $req = new Request($method, $path, $query, $body, ['sid' => $sid]);
        http_response_code(200);
        ob_start();
        try {
            $this->router()->dispatch($req);
        } finally {
            $out = ob_get_clean();
        }
        $decoded = json_decode((string) $out, true);
        return [http_response_code(), is_array($decoded) ? $decoded : []];
    }

    public function testValidationOnCreate(): void
    {
        $userId = $this->makeUser('recur-a@test.local');
        $sid = Sessions::create($userId);
        $base = ['title' => 'T', 'complexity' => 'low', 'estimatedMinutes' => 10];

        // Bad dates and malformed rules → 400.
        foreach (
            [
                ['availableFrom' => 'tomorrow'],
                ['availableFrom' => '2026-02-31'],
                ['recurrence' => ['unit' => 'year', 'interval' => 1]],
                ['recurrence' => ['unit' => 'day', 'interval' => 0]],
                ['recurrence' => ['dayOfMonth' => 32]],
                ['recurrence' => ['unit' => 'day', 'interval' => 1, 'dayOfMonth' => 5]], // families are exclusive
                ['recurrence' => []],
                ['recurrence' => 'daily'],
            ] as $bad
        ) {
            [$status] = $this->dispatch('POST', '/api/tasks', $sid, $base + $bad);
            self::assertSame(400, $status, json_encode($bad));
        }

        // Valid: both families + a snooze date, round-tripped on mapTask.
        [$status, $body] = $this->dispatch('POST', '/api/tasks', $sid, $base + [
            'availableFrom' => '2030-01-15',
            'recurrence' => ['unit' => 'week', 'interval' => 2],
        ]);
        self::assertSame(201, $status);
        self::assertSame('2030-01-15', $body['task']['availableFrom']);
        self::assertSame(['unit' => 'week', 'interval' => 2], $body['task']['recurrence']);

        [$status, $body] = $this->dispatch('POST', '/api/tasks', $sid, $base + [
            'recurrence' => ['dayOfMonth' => 25],
        ]);
        self::assertSame(201, $status);
        self::assertSame(['dayOfMonth' => 25], $body['task']['recurrence']);
    }

    public function testSnoozedTaskIsExcludedFromPlaySelection(): void
    {
        $userId = $this->makeUser('recur-b@test.local');
        $sid = Sessions::create($userId);
        $now = $this->makeTask($userId, 'low', 10);
        $later = $this->makeTask($userId, 'low', 10);
        $this->pdo->prepare("UPDATE tasks SET available_from = '2099-01-01' WHERE id = ?")->execute([$later]);

        // Only the available task is ever picked (and a past date stays in).
        for ($i = 0; $i < 5; $i++) {
            [, $body] = $this->dispatch('GET', '/api/tasks/next', $sid);
            self::assertSame($now, $body['task']['id']);
        }

        // Snooze via PATCH removes it from the pool → empty pick.
        [$status] = $this->dispatch('PATCH', "/api/tasks/{$now}", $sid, ['availableFrom' => '2099-01-01']);
        self::assertSame(200, $status);
        [, $body] = $this->dispatch('GET', '/api/tasks/next', $sid);
        self::assertNull($body['task']);

        // Clearing the snooze restores it.
        [$status] = $this->dispatch('PATCH', "/api/tasks/{$now}", $sid, ['availableFrom' => null]);
        self::assertSame(200, $status);
        [, $body] = $this->dispatch('GET', '/api/tasks/next', $sid);
        self::assertSame($now, $body['task']['id']);
    }

    public function testCompletingARecurringTaskSpawnsExactlyOneClone(): void
    {
        $userId = $this->makeUser('recur-c@test.local');
        $sid = Sessions::create($userId);
        $task = $this->makeTask($userId, 'medium', 20);
        $this->pdo->prepare(
            "UPDATE tasks SET recur_unit = 'day', recur_interval = 3, description = 'D' WHERE id = ?",
        )->execute([$task]);

        [$status, $body] = $this->dispatch('PATCH', "/api/tasks/{$task}", $sid, ['status' => 'done']);
        self::assertSame(200, $status);
        self::assertArrayHasKey('pointsAwarded', $body);
        self::assertArrayHasKey('recursAt', $body);
        $expected = (new \DateTimeImmutable(
            'now',
            new \DateTimeZone(\App\Points\PointsConfig::timezone()),
        ))->modify('+3 day')->format('Y-m-d');
        self::assertSame($expected, $body['recursAt']);

        // Exactly one clone: backlog, dated, rule + fields copied.
        $clones = $this->pdo->prepare(
            "SELECT * FROM tasks WHERE user_id = ? AND id <> ? ORDER BY id",
        );
        $clones->execute([$userId, $task]);
        $rows = $clones->fetchAll();
        self::assertCount(1, $rows);
        $clone = $rows[0];
        self::assertSame('backlog', $clone['status']);
        self::assertSame($expected, $clone['available_from']);
        self::assertSame('day', $clone['recur_unit']);
        self::assertSame(3, (int) $clone['recur_interval']);
        self::assertSame('D', $clone['description']);
        self::assertNull($clone['archived_at']);

        // A second identical PATCH (already done) doesn't transition → no spawn.
        [$status, $body] = $this->dispatch('PATCH', "/api/tasks/{$task}", $sid, ['status' => 'done']);
        self::assertSame(200, $status);
        self::assertArrayNotHasKey('recursAt', $body);

        // Reopen + recomplete: points already awarded once ever, so no respawn.
        $this->dispatch('PATCH', "/api/tasks/{$task}", $sid, ['status' => 'backlog']);
        [$status, $body] = $this->dispatch('PATCH', "/api/tasks/{$task}", $sid, ['status' => 'done']);
        self::assertSame(200, $status);
        self::assertArrayNotHasKey('recursAt', $body);
        $clones->execute([$userId, $task]);
        self::assertCount(1, $clones->fetchAll());
    }

    public function testCloneCopiesProjectAndCategory(): void
    {
        $userId = $this->makeUser('recur-d@test.local');
        $sid = Sessions::create($userId);
        $this->pdo->prepare('INSERT INTO projects (user_id, name) VALUES (?, ?)')->execute([$userId, 'P']);
        $projectId = (int) $this->pdo->lastInsertId();
        $this->pdo->prepare('INSERT INTO task_categories (user_id, name, color) VALUES (?, ?, 0)')->execute([$userId, 'C']);
        $categoryId = (int) $this->pdo->lastInsertId();

        $task = $this->makeTask($userId, 'low', 10);
        $this->pdo->prepare(
            "UPDATE tasks SET recur_day_of_month = 25, project_id = ?, category_id = ? WHERE id = ?",
        )->execute([$projectId, $categoryId, $task]);

        [$status, $body] = $this->dispatch('PATCH', "/api/tasks/{$task}", $sid, ['status' => 'done']);
        self::assertSame(200, $status);
        self::assertArrayHasKey('recursAt', $body);

        $clone = $this->pdo->prepare('SELECT * FROM tasks WHERE user_id = ? AND id <> ?');
        $clone->execute([$userId, $task]);
        $row = $clone->fetch();
        self::assertSame($projectId, (int) $row['project_id']);
        self::assertSame($categoryId, (int) $row['category_id']);
        self::assertSame(25, (int) $row['recur_day_of_month']);
    }

    public function testRecurringListFilterShowsOnlyLiveChains(): void
    {
        $userId = $this->makeUser('recur-f@test.local');
        $sid = Sessions::create($userId);
        $plain = $this->makeTask($userId, 'low', 10);
        $live = $this->makeTask($userId, 'low', 10);
        $this->pdo->prepare("UPDATE tasks SET recur_unit = 'day', recur_interval = 1 WHERE id = ?")->execute([$live]);

        // Completing the live occurrence spawns its clone; the DONE occurrence
        // keeps its rule columns but must drop out of the recurring view — only
        // the spawned clone (the new live occurrence) remains.
        [$status] = $this->dispatch('PATCH', "/api/tasks/{$live}", $sid, ['status' => 'done']);
        self::assertSame(200, $status);

        [$status, $body] = $this->dispatch('GET', '/api/tasks', $sid, [], ['recurring' => '1', 'limit' => '25']);
        self::assertSame(200, $status);
        $ids = array_column($body['tasks'], 'id');
        self::assertCount(1, $ids);
        self::assertNotContains($plain, $ids);
        self::assertNotContains($live, $ids);
        self::assertSame(1, $body['counts']['recurring']);
    }

    public function testRecurringTaskExcludedFromProjectCompletion(): void
    {
        $userId = $this->makeUser('recur-e@test.local');
        $sid = Sessions::create($userId);
        $this->pdo->prepare('INSERT INTO projects (user_id, name) VALUES (?, ?)')->execute([$userId, 'P']);
        $projectId = (int) $this->pdo->lastInsertId();

        // 3 non-recurring tasks (#383: the bonus needs ≥ PROJECT_BONUS_MIN_TASKS)
        // + one recurring, all in the project.
        $normals = [];
        for ($i = 0; $i < 3; $i++) {
            $t = $this->makeTask($userId, 'high', 30);
            $this->pdo->prepare('UPDATE tasks SET project_id = ? WHERE id = ?')->execute([$projectId, $t]);
            $normals[] = $t;
        }
        $recurring = $this->makeTask($userId, 'low', 10);
        $this->pdo->prepare('UPDATE tasks SET project_id = ? WHERE id = ?')->execute([$projectId, $recurring]);
        $this->pdo->prepare("UPDATE tasks SET recur_unit = 'week', recur_interval = 1 WHERE id = ?")->execute([$recurring]);

        // Completing every NON-recurring task completes the project (#240
        // bonus pays, #310 marks it done) despite the live recurring task —
        // and the freshly spawned clone doesn't flip it back to active.
        $this->dispatch('PATCH', "/api/tasks/{$normals[0]}", $sid, ['status' => 'done']);
        $this->dispatch('PATCH', "/api/tasks/{$normals[1]}", $sid, ['status' => 'done']);
        [$status, $body] = $this->dispatch('PATCH', "/api/tasks/{$normals[2]}", $sid, ['status' => 'done']);
        self::assertSame(200, $status);
        self::assertArrayHasKey('projectCompleted', $body);
        self::assertSame($projectId, $body['projectCompleted']['projectId']);

        [$status, $body] = $this->dispatch('PATCH', "/api/tasks/{$recurring}", $sid, ['status' => 'done']);
        self::assertSame(200, $status);
        self::assertArrayHasKey('recursAt', $body);
        $p = $this->pdo->prepare('SELECT status FROM projects WHERE id = ?');
        $p->execute([$projectId]);
        self::assertSame('done', $p->fetchColumn());
    }
}

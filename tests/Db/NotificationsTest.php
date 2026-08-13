<?php

declare(strict_types=1);

namespace Tests\Db;

use App\Auth\Sessions;
use App\Controllers\NotificationsController;
use App\Controllers\TasksController;
use App\Http\Request;
use App\Http\Router;

/**
 * In-app notifications (#366), request-level: the lazy activation sweep (who
 * gets notified, dedupe, scoping), mark-all-read, retention pruning, the
 * soft dismiss (which must NOT resurrect on the next sweep), and the
 * task-lifecycle cleanup (completion removes, deletion cascades).
 */
final class NotificationsTest extends DbTestCase
{
    private function router(): Router
    {
        $n = new NotificationsController();
        $tasks = new TasksController();
        $router = new Router();
        $router->get('/api/notifications', [$n, 'index'], true);
        $router->post('/api/notifications/read', [$n, 'readAll'], true);
        $router->delete('/api/notifications/{id}', [$n, 'destroy'], true);
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
        } finally {
            $out = ob_get_clean();
        }
        $decoded = json_decode((string) $out, true);
        return [http_response_code(), is_array($decoded) ? $decoded : []];
    }

    /** Insert a task with a rule/snooze directly (bypassing the API's own paths). */
    private function makeRecurringTask(
        int $userId,
        ?string $availableFrom,
        ?string $unit = 'week',
        ?int $interval = 2,
        ?int $dayOfMonth = null,
        string $status = 'backlog',
    ): int {
        $this->pdo->prepare(
            'INSERT INTO tasks (user_id, title, complexity, estimated_minutes, status,
                                available_from, recur_unit, recur_interval, recur_day_of_month)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )->execute([$userId, 'water the plants', 'low', 10, $status, $availableFrom, $unit, $interval, $dayOfMonth]);
        return (int) $this->pdo->lastInsertId();
    }

    public function testSweepNotifiesActivatedRecurringOnce(): void
    {
        $userId = $this->makeUser('notif-a@test.local');
        $sid = Sessions::create($userId);
        $taskId = $this->makeRecurringTask($userId, '2020-01-15');

        [$status, $body] = $this->dispatch('GET', '/api/notifications', $sid);
        self::assertSame(200, $status);
        self::assertSame(1, $body['unreadCount']);
        self::assertSame(1, $body['totalCount']);
        self::assertCount(1, $body['notifications']);
        $n = $body['notifications'][0];
        self::assertSame('recurring_activated', $n['type']);
        self::assertSame($taskId, $n['taskId']);
        self::assertSame('water the plants', $n['data']['title']);
        self::assertSame(['unit' => 'week', 'interval' => 2], $n['data']['recurrence']);
        self::assertNull($n['readAt']);
        // created_at is the ACTIVATION date, not the sweep moment.
        self::assertStringStartsWith('2020-01-15T00:00:00', $n['createdAt']);

        // Re-sweep is a no-op per task (UNIQUE(type, task_id) + INSERT IGNORE).
        [, $again] = $this->dispatch('GET', '/api/notifications', $sid);
        self::assertCount(1, $again['notifications']);
    }

    public function testSweepSkipsFutureNonRecurringAndNonBacklog(): void
    {
        $userId = $this->makeUser('notif-b@test.local');
        $sid = Sessions::create($userId);

        $this->makeRecurringTask($userId, '2099-01-01');                       // not yet due
        $this->makeRecurringTask($userId, '2020-01-01', null, null);           // snoozed, no rule
        $this->makeRecurringTask($userId, '2020-01-01', 'day', 1, null, 'done'); // already done
        $this->makeRecurringTask($userId, null);                               // rule, never snoozed

        [, $body] = $this->dispatch('GET', '/api/notifications', $sid);
        self::assertSame(0, $body['unreadCount']);
        self::assertCount(0, $body['notifications']);
    }

    public function testMonthlyRulePayload(): void
    {
        $userId = $this->makeUser('notif-c@test.local');
        $sid = Sessions::create($userId);
        $this->makeRecurringTask($userId, '2020-06-15', null, null, 15);

        [, $body] = $this->dispatch('GET', '/api/notifications', $sid);
        self::assertSame(['dayOfMonth' => 15], $body['notifications'][0]['data']['recurrence']);
    }

    public function testSweepIsUserScoped(): void
    {
        $owner = $this->makeUser('notif-owner@test.local');
        $other = $this->makeUser('notif-other@test.local');
        $this->makeRecurringTask($owner, '2020-01-01');

        [, $body] = $this->dispatch('GET', '/api/notifications', Sessions::create($other));
        self::assertSame(0, $body['unreadCount']);
        self::assertCount(0, $body['notifications']);

        [, $own] = $this->dispatch('GET', '/api/notifications', Sessions::create($owner));
        self::assertSame(1, $own['unreadCount']);
    }

    public function testReadAllMarksEverythingRead(): void
    {
        $userId = $this->makeUser('notif-d@test.local');
        $sid = Sessions::create($userId);
        $this->makeRecurringTask($userId, '2020-01-01');
        $this->dispatch('GET', '/api/notifications', $sid);

        [$status] = $this->dispatch('POST', '/api/notifications/read', $sid);
        self::assertSame(200, $status);

        [, $body] = $this->dispatch('GET', '/api/notifications', $sid);
        self::assertSame(0, $body['unreadCount']);
        // Read ≠ gone: the row still counts toward the view total (the badge
        // stays amber until the row is dismissed or its task completes).
        self::assertSame(1, $body['totalCount']);
        self::assertNotNull($body['notifications'][0]['readAt']);
    }

    public function testPruneDropsOldReadKeepsUnread(): void
    {
        $userId = $this->makeUser('notif-e@test.local');
        $sid = Sessions::create($userId);
        $ins = $this->pdo->prepare(
            'INSERT INTO notifications (user_id, type, task_id, data, created_at, read_at)
             VALUES (?, ?, NULL, ?, NOW() - INTERVAL 60 DAY, ?)',
        );
        // Read 31+ days ago → pruned; unread of the same age → kept.
        $ins->execute([$userId, 'recurring_activated', '{"title":"old read"}', '2020-01-01 00:00:00']);
        $ins->execute([$userId, 'recurring_activated', '{"title":"old unread"}', null]);

        [, $body] = $this->dispatch('GET', '/api/notifications', $sid);
        self::assertCount(1, $body['notifications']);
        self::assertSame('old unread', $body['notifications'][0]['data']['title']);
    }

    public function testTaskDeletionCascadesNotificationAway(): void
    {
        $userId = $this->makeUser('notif-f@test.local');
        $sid = Sessions::create($userId);
        $taskId = $this->makeRecurringTask($userId, '2020-01-01');
        $this->dispatch('GET', '/api/notifications', $sid);

        $this->pdo->prepare('DELETE FROM tasks WHERE id = ?')->execute([$taskId]);

        [, $body] = $this->dispatch('GET', '/api/notifications', $sid);
        self::assertSame(0, $body['unreadCount']);
        self::assertCount(0, $body['notifications']);
    }

    public function testCompletingTheTaskRemovesNotification(): void
    {
        $userId = $this->makeUser('notif-g@test.local');
        $sid = Sessions::create($userId);
        $taskId = $this->makeRecurringTask($userId, '2020-01-01');
        [, $before] = $this->dispatch('GET', '/api/notifications', $sid);
        self::assertCount(1, $before['notifications']);

        [$status] = $this->dispatch('PATCH', "/api/tasks/{$taskId}", $sid, ['status' => 'done']);
        self::assertSame(200, $status);

        // Gone — and NOT resurrected by the sweep (a done task fails its
        // backlog condition; the spawned #250 clone is future-dated).
        [, $after] = $this->dispatch('GET', '/api/notifications', $sid);
        self::assertSame(0, $after['unreadCount']);
        self::assertCount(0, $after['notifications']);
    }

    public function testDismissHidesWithoutResurrection(): void
    {
        $userId = $this->makeUser('notif-h@test.local');
        $sid = Sessions::create($userId);
        $this->makeRecurringTask($userId, '2020-01-01');
        [, $body] = $this->dispatch('GET', '/api/notifications', $sid);
        $nid = $body['notifications'][0]['id'];

        [$status] = $this->dispatch('DELETE', "/api/notifications/{$nid}", $sid);
        self::assertSame(200, $status);

        // The task is STILL due+backlog, but the soft-deleted row anchors the
        // dedupe — the next sweep must not re-insert.
        [, $after] = $this->dispatch('GET', '/api/notifications', $sid);
        self::assertSame(0, $after['unreadCount']);
        self::assertSame(0, $after['totalCount']);
        self::assertCount(0, $after['notifications']);

        // Re-dismiss and foreign/unknown ids → 404 (non-enumerating, #129).
        [$again] = $this->dispatch('DELETE', "/api/notifications/{$nid}", $sid);
        self::assertSame(404, $again);
        $other = $this->makeUser('notif-h2@test.local');
        [$foreign] = $this->dispatch('DELETE', "/api/notifications/{$nid}", Sessions::create($other));
        self::assertSame(404, $foreign);
    }

    // ---- Overrun nudge + auto-return (#403) ----

    /** An in_progress task whose run started $minutesAgo minutes back. */
    private function makeRunningTask(int $userId, int $estimatedMinutes, int $minutesAgo): int
    {
        $taskId = $this->makeTask($userId, 'low', $estimatedMinutes);
        $this->pdo->prepare(
            "UPDATE tasks SET status = 'in_progress',
                    started_at = DATE_SUB(NOW(), INTERVAL ? MINUTE) WHERE id = ?",
        )->execute([$minutesAgo, $taskId]);
        return $taskId;
    }

    /** @param array<string,mixed> $body */
    private function ofType(array $body, string $type): array
    {
        return array_values(array_filter(
            $body['notifications'],
            static fn (array $n): bool => $n['type'] === $type,
        ));
    }

    public function testOverrunWarnsOnceAtThreeTimes(): void
    {
        $userId = $this->makeUser('notif-i@test.local');
        $sid = Sessions::create($userId);
        $calm = $this->makeRunningTask($userId, 10, 25);   // 2.5× — under the bar
        $over = $this->makeRunningTask($userId, 10, 35);   // 3.5× — warn

        [, $body] = $this->dispatch('GET', '/api/notifications', $sid);
        $warns = $this->ofType($body, 'task_overrun');
        self::assertCount(1, $warns);
        self::assertSame($over, $warns[0]['taskId']);
        self::assertSame('test task', $warns[0]['data']['title']);
        self::assertSame(10, $warns[0]['data']['estimatedMinutes']);
        self::assertSame(35, $warns[0]['data']['elapsedMinutes']);
        self::assertSame(5, $warns[0]['data']['returnRatio']);
        self::assertCount(0, $this->ofType($body, 'task_returned'));

        // The warned task keeps RUNNING (stage 1 never touches state), and the
        // dedupe holds on a re-fetch.
        $status = $this->pdo->query("SELECT status FROM tasks WHERE id = {$over}")->fetchColumn();
        self::assertSame('in_progress', $status);
        [, $again] = $this->dispatch('GET', '/api/notifications', $sid);
        self::assertCount(1, $this->ofType($again, 'task_overrun'));
        // The 2.5× task stayed silent.
        self::assertNotContains($calm, array_column($again['notifications'], 'taskId'));
    }

    public function testOverrunReturnsToReadyAtFiveTimes(): void
    {
        $userId = $this->makeUser('notif-j@test.local');
        $sid = Sessions::create($userId);
        $task = $this->makeRunningTask($userId, 10, 55); // 5.5× — return

        [, $body] = $this->dispatch('GET', '/api/notifications', $sid);
        // One "returned" notice, and NO same-fetch warn for the same task.
        $returned = $this->ofType($body, 'task_returned');
        self::assertCount(1, $returned);
        self::assertSame($task, $returned[0]['taskId']);
        self::assertCount(0, $this->ofType($body, 'task_overrun'));

        // The normal pause semantics applied (#383): back to Ready, timing
        // cleared, speed bonus forfeited sticky.
        $row = $this->pdo->query(
            "SELECT status, started_at, bonus_forfeited FROM tasks WHERE id = {$task}",
        )->fetch();
        self::assertSame('backlog', $row['status']);
        self::assertNull($row['started_at']);
        self::assertSame(1, (int) $row['bonus_forfeited']);
    }

    public function testReturnSupersedesAnEarlierWarn(): void
    {
        $userId = $this->makeUser('notif-k@test.local');
        $sid = Sessions::create($userId);
        $task = $this->makeRunningTask($userId, 10, 35); // 3.5× — warn first
        [, $body] = $this->dispatch('GET', '/api/notifications', $sid);
        self::assertCount(1, $this->ofType($body, 'task_overrun'));

        // The run drags on past 5× — the warn is stale ("finish it or it goes
        // back" no longer true) and must be replaced by the returned notice.
        $this->pdo->prepare(
            'UPDATE tasks SET started_at = DATE_SUB(NOW(), INTERVAL 55 MINUTE) WHERE id = ?',
        )->execute([$task]);
        [, $after] = $this->dispatch('GET', '/api/notifications', $sid);
        self::assertCount(0, $this->ofType($after, 'task_overrun'));
        self::assertCount(1, $this->ofType($after, 'task_returned'));
    }

    public function testStatusTransitionReArmsTheOverrunDedupe(): void
    {
        $userId = $this->makeUser('notif-l@test.local');
        $sid = Sessions::create($userId);
        $task = $this->makeRunningTask($userId, 10, 35);
        [, $body] = $this->dispatch('GET', '/api/notifications', $sid);
        self::assertCount(1, $this->ofType($body, 'task_overrun'));

        // A manual send-back ends the run — its warn is stale and goes.
        [$status] = $this->dispatch('PATCH', "/api/tasks/{$task}", $sid, ['status' => 'backlog']);
        self::assertSame(200, $status);
        [, $after] = $this->dispatch('GET', '/api/notifications', $sid);
        self::assertCount(0, $this->ofType($after, 'task_overrun'));

        // A fresh run that overruns again warns again (per-run dedupe).
        [$status] = $this->dispatch('PATCH', "/api/tasks/{$task}", $sid, ['status' => 'in_progress']);
        self::assertSame(200, $status);
        $this->pdo->prepare(
            'UPDATE tasks SET started_at = DATE_SUB(NOW(), INTERVAL 35 MINUTE) WHERE id = ?',
        )->execute([$task]);
        [, $rearmed] = $this->dispatch('GET', '/api/notifications', $sid);
        self::assertCount(1, $this->ofType($rearmed, 'task_overrun'));
    }
}

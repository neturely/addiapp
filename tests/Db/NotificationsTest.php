<?php

declare(strict_types=1);

namespace Tests\Db;

use App\Auth\Sessions;
use App\Controllers\NotificationsController;
use App\Http\Request;
use App\Http\Router;

/**
 * In-app notifications (#366), request-level: the lazy activation sweep (who
 * gets notified, dedupe, scoping), mark-all-read, retention pruning, and the
 * snapshot surviving task deletion.
 */
final class NotificationsTest extends DbTestCase
{
    private function router(): Router
    {
        $n = new NotificationsController();
        $router = new Router();
        $router->get('/api/notifications', [$n, 'index'], true);
        $router->post('/api/notifications/read', [$n, 'readAll'], true);
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

    public function testNotificationSurvivesTaskDeletion(): void
    {
        $userId = $this->makeUser('notif-f@test.local');
        $sid = Sessions::create($userId);
        $taskId = $this->makeRecurringTask($userId, '2020-01-01');
        $this->dispatch('GET', '/api/notifications', $sid);

        $this->pdo->prepare('DELETE FROM tasks WHERE id = ?')->execute([$taskId]);

        [, $body] = $this->dispatch('GET', '/api/notifications', $sid);
        self::assertCount(1, $body['notifications']);
        self::assertNull($body['notifications'][0]['taskId']);
        self::assertSame('water the plants', $body['notifications'][0]['data']['title']);
    }
}

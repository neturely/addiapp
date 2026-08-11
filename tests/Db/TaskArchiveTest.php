<?php

declare(strict_types=1);

namespace Tests\Db;

use App\Auth\Sessions;
use App\Controllers\TasksController;
use App\Http\Request;
use App\Http\Router;

/**
 * Task archiving (#312), request-level: the `archived` PATCH flag (done-only),
 * default-list exclusion + the ?archived=1 archive view, the counts shape, the
 * reopen-clears-archive invariant (archived ⇒ done, keeping filed tasks out of
 * the Play pool), and unarchive.
 */
final class TaskArchiveTest extends DbTestCase
{
    private function router(): Router
    {
        $tasks = new TasksController();
        $router = new Router();
        $router->get('/api/tasks', [$tasks, 'index'], true);
        $router->get('/api/tasks/next', [$tasks, 'next'], true);
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

    public function testArchiveIsDoneOnlyAndListsSplit(): void
    {
        $userId = $this->makeUser('archive-a@test.local');
        $sid = Sessions::create($userId);
        $ready = $this->makeTask($userId, 'low', 10);
        $done = $this->makeTask($userId, 'medium', 20);
        $this->pdo->prepare("UPDATE tasks SET status = 'done' WHERE id = ?")->execute([$done]);

        // A backlog task can't be filed away; a non-bool flag is bad input.
        [$status] = $this->dispatch('PATCH', "/api/tasks/{$ready}", $sid, ['archived' => true]);
        self::assertSame(400, $status);
        [$status] = $this->dispatch('PATCH', "/api/tasks/{$done}", $sid, ['archived' => 'yes']);
        self::assertSame(400, $status);

        [$status, $body] = $this->dispatch('PATCH', "/api/tasks/{$done}", $sid, ['archived' => true]);
        self::assertSame(200, $status);
        self::assertNotNull($body['task']['archivedAt']);

        // The Overview EXCLUDES the archived row (#406, revising #332 — filed
        // tasks live in the Archived tab and the per-project/category filters),
        // the STATUS tab excludes it ("Done" = done-not-filed), and the archive
        // view returns exactly it. `counts.all` excludes archived too.
        [, $body] = $this->dispatch('GET', '/api/tasks', $sid, [], ['limit' => '10']);
        self::assertSame([$ready], array_column($body['tasks'], 'id'));
        self::assertSame(1, $body['counts']['all']);
        self::assertSame(0, $body['counts']['done']);
        self::assertSame(1, $body['counts']['archived']);

        [, $body] = $this->dispatch('GET', '/api/tasks', $sid, [], ['limit' => '10', 'status' => 'done']);
        self::assertSame([], array_column($body['tasks'], 'id'));

        [, $body] = $this->dispatch('GET', '/api/tasks', $sid, [], ['limit' => '10', 'archived' => '1']);
        self::assertSame([$done], array_column($body['tasks'], 'id'));

        // Unarchive → back into the working lists as plain done.
        [$status, $body] = $this->dispatch('PATCH', "/api/tasks/{$done}", $sid, ['archived' => false]);
        self::assertSame(200, $status);
        self::assertNull($body['task']['archivedAt']);
        [, $body] = $this->dispatch('GET', '/api/tasks', $sid, [], ['limit' => '10']);
        self::assertSame(2, $body['counts']['all']);
        self::assertSame(1, $body['counts']['done']);
        self::assertSame(0, $body['counts']['archived']);
    }

    public function testProjectFilterKeepsArchivedRowsSortedLast(): void
    {
        $userId = $this->makeUser('archive-d@test.local');
        $sid = Sessions::create($userId);
        $this->pdo->prepare('INSERT INTO projects (user_id, name) VALUES (?, ?)')
            ->execute([$userId, 'Filter probe']);
        $projectId = (int) $this->pdo->lastInsertId();

        // Oldest row is ARCHIVED — under the plain newest/oldest sort it would
        // lead the ascending list; #406 groups it to the bottom regardless.
        $filed = $this->makeTask($userId, 'low', 10);
        $open = $this->makeTask($userId, 'medium', 20);
        $this->pdo->prepare("UPDATE tasks SET project_id = ? WHERE id IN (?, ?)")
            ->execute([$projectId, $filed, $open]);
        $this->pdo->prepare("UPDATE tasks SET status = 'done', archived_at = NOW() WHERE id = ?")
            ->execute([$filed]);

        // Both sort directions: archived stays last (the toggle applies within
        // each group), and the row still ships for the client's Archived pill.
        [, $body] = $this->dispatch('GET', '/api/tasks', $sid, [], [
            'limit' => '10', 'projectId' => (string) $projectId,
        ]);
        self::assertSame([$open, $filed], array_column($body['tasks'], 'id'));
        [, $body] = $this->dispatch('GET', '/api/tasks', $sid, [], [
            'limit' => '10', 'projectId' => (string) $projectId, 'order' => 'desc',
        ]);
        self::assertSame([$open, $filed], array_column($body['tasks'], 'id'));

        // A status tab scoped to the project is a working list — archived out.
        [, $body] = $this->dispatch('GET', '/api/tasks', $sid, [], [
            'limit' => '10', 'projectId' => (string) $projectId, 'status' => 'done',
        ]);
        self::assertSame([], array_column($body['tasks'], 'id'));
    }

    public function testReopeningAnArchivedTaskUnfilesIt(): void
    {
        $userId = $this->makeUser('archive-b@test.local');
        $sid = Sessions::create($userId);
        $task = $this->makeTask($userId, 'low', 10);
        $this->pdo->prepare("UPDATE tasks SET status = 'done', archived_at = NOW() WHERE id = ?")->execute([$task]);

        // Reopen to backlog: the archive flag clears with the transition, so an
        // archived row can never sit in the Play candidate pool.
        [$status, $body] = $this->dispatch('PATCH', "/api/tasks/{$task}", $sid, ['status' => 'backlog']);
        self::assertSame(200, $status);
        self::assertNull($body['task']['archivedAt']);
        self::assertSame('backlog', $body['task']['status']);

        [, $body] = $this->dispatch('GET', '/api/tasks/next', $sid);
        self::assertSame($task, $body['task']['id']);
    }

    public function testArchiveAndStatusInOnePatch(): void
    {
        $userId = $this->makeUser('archive-c@test.local');
        $sid = Sessions::create($userId);
        $task = $this->makeTask($userId, 'high', 30);

        // Completing + archiving in one PATCH is allowed (the done-check sees
        // the incoming status), and the completion still awards normally.
        [$status, $body] = $this->dispatch('PATCH', "/api/tasks/{$task}", $sid, [
            'status' => 'done',
            'archived' => true,
        ]);
        self::assertSame(200, $status);
        self::assertSame('done', $body['task']['status']);
        self::assertNotNull($body['task']['archivedAt']);
        self::assertArrayHasKey('pointsAwarded', $body);
    }
}

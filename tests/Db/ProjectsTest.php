<?php

declare(strict_types=1);

namespace Tests\Db;

use App\Auth\Sessions;
use App\Controllers\ProjectsController;
use App\Controllers\TasksController;
use App\Http\Request;
use App\Http\Router;

/**
 * Request-level integration tests for Projects (#234): CRUD is user-scoped and
 * non-enumerating (404-not-403, per #129), the "X of Y remaining" counts are
 * correct, Archive drops a project from the active list, and a task can only be
 * created into an active project the caller owns. Driven through the real router
 * + controllers so a refactor can't regress the contract.
 */
final class ProjectsTest extends DbTestCase
{
    private function router(): Router
    {
        $projects = new ProjectsController();
        $tasks = new TasksController();
        $router = new Router();
        $router->get('/api/projects', [$projects, 'index'], true);
        $router->post('/api/projects', [$projects, 'create'], true);
        $router->patch('/api/projects/{id}', [$projects, 'update'], true);
        $router->get('/api/tasks', [$tasks, 'index'], true);
        $router->post('/api/tasks', [$tasks, 'create'], true);
        $router->patch('/api/tasks/{id}', [$tasks, 'update'], true);
        return $router;
    }

    /**
     * Dispatch a request and return [status, decodedJsonBody].
     *
     * @param array<string,mixed> $body
     * @param array<string,string> $query
     * @return array{0:int,1:array<string,mixed>}
     */
    private function dispatch(string $method, string $path, string $sid, array $body = [], array $query = []): array
    {
        $req = new Request($method, $path, $query, $body, ['sid' => $sid]);
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

    public function testCreateReturns201WithZeroCounts(): void
    {
        $sid = Sessions::create($this->makeUser('proj-create@test.local'));
        [$status, $body] = $this->dispatch('POST', '/api/projects', $sid, ['name' => 'Kitchen reno']);

        self::assertSame(201, $status);
        self::assertSame('Kitchen reno', $body['project']['name']);
        self::assertSame('active', $body['project']['status']);
        self::assertSame(0, $body['project']['totalCount']);
        self::assertSame(0, $body['project']['remainingCount']);
    }

    public function testCreateRejectsEmptyName(): void
    {
        $sid = Sessions::create($this->makeUser('proj-empty@test.local'));
        [$status] = $this->dispatch('POST', '/api/projects', $sid, ['name' => '   ']);
        self::assertSame(400, $status);
    }

    public function testListReturnsRemainingAndTotalCounts(): void
    {
        $userId = $this->makeUser('proj-counts@test.local');
        $sid = Sessions::create($userId);
        [, $body] = $this->dispatch('POST', '/api/projects', $sid, ['name' => 'Counts']);
        $projectId = (int) $body['project']['id'];

        // 3 tasks in the project; complete 1 → remaining 2 of 3. Plus a done task.
        $this->assignTask($this->makeTask($userId, 'low', 5), $projectId);
        $this->assignTask($this->makeTask($userId, 'low', 5), $projectId);
        $done = $this->makeTask($userId, 'low', 5);
        $this->assignTask($done, $projectId);
        $this->pdo->prepare("UPDATE tasks SET status = 'done' WHERE id = ?")->execute([$done]);

        [$status, $list] = $this->dispatch('GET', '/api/projects', $sid);
        self::assertSame(200, $status);
        self::assertCount(1, $list['projects']);
        self::assertSame(3, $list['projects'][0]['totalCount']);
        self::assertSame(2, $list['projects'][0]['remainingCount']);
    }

    public function testArchiveRemovesFromActiveList(): void
    {
        $sid = Sessions::create($this->makeUser('proj-archive@test.local'));
        [, $body] = $this->dispatch('POST', '/api/projects', $sid, ['name' => 'Temp']);
        $projectId = (int) $body['project']['id'];

        [$status, $updated] = $this->dispatch('PATCH', "/api/projects/{$projectId}", $sid, ['status' => 'archived']);
        self::assertSame(200, $status);
        self::assertSame('archived', $updated['project']['status']);

        [, $list] = $this->dispatch('GET', '/api/projects', $sid);
        self::assertCount(0, $list['projects']);
    }

    public function testCrossUserPatchIsNotFoundNot403(): void
    {
        $ownerSid = Sessions::create($this->makeUser('proj-owner@test.local'));
        [, $body] = $this->dispatch('POST', '/api/projects', $ownerSid, ['name' => 'Private']);
        $projectId = (int) $body['project']['id'];

        $otherSid = Sessions::create($this->makeUser('proj-other@test.local'));
        [$status] = $this->dispatch('PATCH', "/api/projects/{$projectId}", $otherSid, ['name' => 'hijacked']);
        self::assertSame(404, $status);
    }

    public function testCreateTaskIntoOwnedActiveProject(): void
    {
        $userId = $this->makeUser('task-proj-ok@test.local');
        $sid = Sessions::create($userId);
        [, $body] = $this->dispatch('POST', '/api/projects', $sid, ['name' => 'Has tasks']);
        $projectId = (int) $body['project']['id'];

        [$status, $task] = $this->dispatch('POST', '/api/tasks', $sid, [
            'title' => 'In project',
            'complexity' => 'medium',
            'estimatedMinutes' => 10,
            'projectId' => $projectId,
        ]);
        self::assertSame(201, $status);
        self::assertSame($projectId, $task['task']['projectId']);
    }

    public function testCreateTaskRejectsForeignProject(): void
    {
        $ownerSid = Sessions::create($this->makeUser('task-proj-owner@test.local'));
        [, $body] = $this->dispatch('POST', '/api/projects', $ownerSid, ['name' => 'Not yours']);
        $projectId = (int) $body['project']['id'];

        $otherSid = Sessions::create($this->makeUser('task-proj-thief@test.local'));
        [$status] = $this->dispatch('POST', '/api/tasks', $otherSid, [
            'title' => 'Sneaky',
            'complexity' => 'low',
            'estimatedMinutes' => 5,
            'projectId' => $projectId,
        ]);
        self::assertSame(400, $status);
    }

    public function testCreateTaskRejectsArchivedProject(): void
    {
        $userId = $this->makeUser('task-proj-archived@test.local');
        $sid = Sessions::create($userId);
        [, $body] = $this->dispatch('POST', '/api/projects', $sid, ['name' => 'Archived']);
        $projectId = (int) $body['project']['id'];
        $this->dispatch('PATCH', "/api/projects/{$projectId}", $sid, ['status' => 'archived']);

        [$status] = $this->dispatch('POST', '/api/tasks', $sid, [
            'title' => 'Too late',
            'complexity' => 'low',
            'estimatedMinutes' => 5,
            'projectId' => $projectId,
        ]);
        self::assertSame(400, $status);
    }

    // --- #236 (B): Unassigned filter + assign/unassign via PATCH ---

    public function testUnassignedFilterAndCount(): void
    {
        $userId = $this->makeUser('unassigned-filter@test.local');
        $sid = Sessions::create($userId);
        [, $body] = $this->dispatch('POST', '/api/projects', $sid, ['name' => 'P']);
        $projectId = (int) $body['project']['id'];

        // 1 assigned, 2 unassigned.
        $this->assignTask($this->makeTask($userId, 'low', 5), $projectId);
        $this->makeTask($userId, 'low', 5);
        $this->makeTask($userId, 'low', 5);

        [$status, $page] = $this->dispatch('GET', '/api/tasks', $sid, [], ['unassigned' => '1', 'limit' => '25']);
        self::assertSame(200, $status);
        self::assertCount(2, $page['tasks']);
        foreach ($page['tasks'] as $t) {
            self::assertNull($t['projectId']);
        }
        // First-page counts carry the unassigned axis.
        self::assertSame(2, $page['counts']['unassigned']);
        self::assertSame(3, $page['counts']['all']);
    }

    public function testAssignViaPatch(): void
    {
        $userId = $this->makeUser('assign-patch@test.local');
        $sid = Sessions::create($userId);
        [, $body] = $this->dispatch('POST', '/api/projects', $sid, ['name' => 'P']);
        $projectId = (int) $body['project']['id'];
        $taskId = $this->makeTask($userId, 'low', 5);

        [$status, $res] = $this->dispatch('PATCH', "/api/tasks/{$taskId}", $sid, ['projectId' => $projectId]);
        self::assertSame(200, $status);
        self::assertSame($projectId, $res['task']['projectId']);
    }

    public function testUnassignViaPatchNull(): void
    {
        $userId = $this->makeUser('unassign-patch@test.local');
        $sid = Sessions::create($userId);
        [, $body] = $this->dispatch('POST', '/api/projects', $sid, ['name' => 'P']);
        $projectId = (int) $body['project']['id'];
        $taskId = $this->makeTask($userId, 'low', 5);
        $this->assignTask($taskId, $projectId);

        [$status, $res] = $this->dispatch('PATCH', "/api/tasks/{$taskId}", $sid, ['projectId' => null]);
        self::assertSame(200, $status);
        self::assertNull($res['task']['projectId']);
    }

    public function testAssignViaPatchRejectsForeignProject(): void
    {
        $ownerSid = Sessions::create($this->makeUser('assign-foreign-owner@test.local'));
        [, $body] = $this->dispatch('POST', '/api/projects', $ownerSid, ['name' => 'Theirs']);
        $projectId = (int) $body['project']['id'];

        $otherId = $this->makeUser('assign-foreign-thief@test.local');
        $otherSid = Sessions::create($otherId);
        $taskId = $this->makeTask($otherId, 'low', 5);

        [$status] = $this->dispatch('PATCH', "/api/tasks/{$taskId}", $otherSid, ['projectId' => $projectId]);
        self::assertSame(400, $status);
    }

    public function testAssignViaPatchRejectsArchivedProject(): void
    {
        $userId = $this->makeUser('assign-archived@test.local');
        $sid = Sessions::create($userId);
        [, $body] = $this->dispatch('POST', '/api/projects', $sid, ['name' => 'P']);
        $projectId = (int) $body['project']['id'];
        $this->dispatch('PATCH', "/api/projects/{$projectId}", $sid, ['status' => 'archived']);
        $taskId = $this->makeTask($userId, 'low', 5);

        [$status] = $this->dispatch('PATCH', "/api/tasks/{$taskId}", $sid, ['projectId' => $projectId]);
        self::assertSame(400, $status);
    }

    private function assignTask(int $taskId, int $projectId): void
    {
        $this->pdo->prepare('UPDATE tasks SET project_id = ? WHERE id = ?')->execute([$projectId, $taskId]);
    }
}

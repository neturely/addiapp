<?php

declare(strict_types=1);

namespace Tests\Db;

use App\Auth\Sessions;
use App\Controllers\TasksController;
use App\Http\Request;
use App\Http\Router;

/**
 * Tier-3 request-level integration test (#129): cross-user task access is
 * NON-ENUMERATING — GET/PATCH/DELETE of another user's task returns 404 (not
 * 403), so a caller can't tell an existing-but-not-yours task from a missing one.
 * Locks the behaviour in through the real router + controller so a future
 * refactor can't regress it into a 403 (which would leak task existence).
 *
 * Establishes the minimal request harness (build a Request with a `sid` cookie,
 * dispatch through a Router wired with the task routes, read the status) that
 * unlocks future endpoint-level tests without pulling in Tier 4.
 */
final class TaskAccessTest extends DbTestCase
{
    private function router(): Router
    {
        $tasks = new TasksController();
        $router = new Router();
        $router->get('/api/tasks/{id}', [$tasks, 'show'], true);
        $router->patch('/api/tasks/{id}', [$tasks, 'update'], true);
        $router->delete('/api/tasks/{id}', [$tasks, 'destroy'], true);
        return $router;
    }

    /**
     * Dispatch a request carrying `$sid` and return the HTTP status. Output is
     * buffered + discarded (the handlers echo JSON) so the status is the signal.
     *
     * @param array<string,mixed> $body
     */
    private function dispatch(string $method, string $path, string $sid, array $body = []): int
    {
        $req = new Request($method, $path, [], $body, ['sid' => $sid]);
        http_response_code(200); // baseline; every handler sets its own
        ob_start();
        try {
            $this->router()->dispatch($req);
        } finally {
            ob_end_clean();
        }
        return http_response_code();
    }

    public function testNonOwnerGetsNotFoundNot403(): void
    {
        $owner = $this->makeUser('owner-a@test.local');
        $taskId = $this->makeTask($owner, 'medium', 10);

        $other = $this->makeUser('other-b@test.local');
        $sidB = Sessions::create($other);
        $path = "/api/tasks/{$taskId}";

        // A valid patch body so update() passes input validation and reaches the
        // ownership check (that's where the 404 must come from, not a 400).
        self::assertSame(404, $this->dispatch('GET', $path, $sidB));
        self::assertSame(404, $this->dispatch('PATCH', $path, $sidB, ['title' => 'hijacked']));
        self::assertSame(404, $this->dispatch('DELETE', $path, $sidB));
    }

    public function testOwnerCanAccessTheSameTask(): void
    {
        // Sanity: the 404 above is specifically the cross-user case, not a broken
        // route — the owner gets 200 for the same id.
        $owner = $this->makeUser('owner-c@test.local');
        $taskId = $this->makeTask($owner, 'high', 20);
        $sidA = Sessions::create($owner);

        self::assertSame(200, $this->dispatch('GET', "/api/tasks/{$taskId}", $sidA));
    }

    public function testUnauthenticatedGets401(): void
    {
        // No/invalid sid never reaches the controller — the auth gate answers 401.
        $status = $this->dispatch('GET', '/api/tasks/1', bin2hex(random_bytes(32)));
        self::assertSame(401, $status);
    }
}

<?php

declare(strict_types=1);

namespace Tests\Db;

use App\Auth\Sessions;
use App\Controllers\CategoriesController;
use App\Controllers\TasksController;
use App\Http\Request;
use App\Http\Router;

/**
 * Request-level task-categories coverage (#276), through the real router +
 * controllers: CRUD with counts, the 404-not-403 non-enumeration rule (#129),
 * task create/assign into a category, the ?categoryId list filter and
 * /tasks/next?category scope, and delete leaving tasks intact (SET NULL).
 */
final class CategoriesTest extends DbTestCase
{
    private function router(): Router
    {
        $categories = new CategoriesController();
        $tasks = new TasksController();
        $router = new Router();
        $router->get('/api/categories', [$categories, 'index'], true);
        $router->post('/api/categories', [$categories, 'create'], true);
        $router->patch('/api/categories/{id}', [$categories, 'update'], true);
        $router->delete('/api/categories/{id}', [$categories, 'destroy'], true);
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

    private function makeSessionUser(string $email): array
    {
        $id = $this->makeUser($email);
        return [$id, Sessions::create($id)];
    }

    public function testCrudWithCountsAndTaskAssignment(): void
    {
        [, $sid] = $this->makeSessionUser('cat-crud@test.local');

        // Create (out-of-range colour → 400; valid → 201).
        [$status] = $this->dispatch('POST', '/api/categories', $sid, ['name' => 'Errands', 'color' => 99]);
        self::assertSame(400, $status);
        [$status, $body] = $this->dispatch('POST', '/api/categories', $sid, ['name' => 'Errands', 'color' => 3]);
        self::assertSame(201, $status);
        $catId = (int) $body['category']['id'];
        self::assertSame(0, $body['category']['totalCount']);

        // Create a task INTO the category + assign an existing one via PATCH.
        [$status, $body] = $this->dispatch('POST', '/api/tasks', $sid, [
            'title' => 'buy milk',
            'complexity' => 'low',
            'estimatedMinutes' => 10,
            'categoryId' => $catId,
        ]);
        self::assertSame(201, $status);
        self::assertSame($catId, $body['task']['categoryId']);

        $other = (int) $body['task']['userId'];
        $taskB = $this->makeTask($other, 'medium', 15);
        [$status, $body] = $this->dispatch('PATCH', "/api/tasks/{$taskB}", $sid, ['categoryId' => $catId]);
        self::assertSame(200, $status);
        self::assertSame($catId, $body['task']['categoryId']);

        // Counts reflect both; the list filter returns exactly them (+ joined label).
        [, $body] = $this->dispatch('GET', '/api/categories', $sid);
        self::assertSame(2, $body['categories'][0]['totalCount']);
        self::assertSame(2, $body['categories'][0]['remainingCount']);

        [$status, $body] = $this->dispatch('GET', '/api/tasks', $sid, [], ['categoryId' => (string) $catId, 'limit' => '10']);
        self::assertSame(200, $status);
        self::assertCount(2, $body['tasks']);
        self::assertSame('Errands', $body['tasks'][0]['category']['name']);
        self::assertSame(3, $body['tasks'][0]['category']['color']);

        // Rename + unlabel one task (categoryId: null).
        [$status, $body] = $this->dispatch('PATCH', "/api/categories/{$catId}", $sid, ['name' => 'Chores']);
        self::assertSame(200, $status);
        self::assertSame('Chores', $body['category']['name']);
        [$status, $body] = $this->dispatch('PATCH', "/api/tasks/{$taskB}", $sid, ['categoryId' => null]);
        self::assertSame(200, $status);
        self::assertNull($body['task']['categoryId']);
    }

    public function testDescriptionRoundTrip(): void
    {
        [, $sid] = $this->makeSessionUser('cat-desc@test.local');

        // Invalid shapes → 400 (the projects validator, #336).
        [$status] = $this->dispatch('POST', '/api/categories', $sid, ['name' => 'D', 'description' => 42]);
        self::assertSame(400, $status);
        [$status] = $this->dispatch('POST', '/api/categories', $sid, ['name' => 'D', 'description' => str_repeat('x', 1001)]);
        self::assertSame(400, $status);

        // Create with one; empty string normalizes to NULL on PATCH.
        [$status, $body] = $this->dispatch('POST', '/api/categories', $sid, ['name' => 'Errands', 'description' => ' weekly shopping runs ']);
        self::assertSame(201, $status);
        $catId = (int) $body['category']['id'];
        self::assertSame('weekly shopping runs', $body['category']['description']);

        [$status, $body] = $this->dispatch('PATCH', "/api/categories/{$catId}", $sid, ['description' => '']);
        self::assertSame(200, $status);
        self::assertNull($body['category']['description']);

        [, $body] = $this->dispatch('GET', '/api/categories', $sid);
        self::assertNull($body['categories'][0]['description']);
    }

    public function testNextScopesToTheCategory(): void
    {
        [$userId, $sid] = $this->makeSessionUser('cat-next@test.local');
        [, $body] = $this->dispatch('POST', '/api/categories', $sid, ['name' => 'Focus']);
        $catId = (int) $body['category']['id'];

        $inCat = $this->makeTask($userId, 'low', 10);
        $this->pdo->prepare('UPDATE tasks SET category_id = ? WHERE id = ?')->execute([$catId, $inCat]);
        $this->makeTask($userId, 'low', 10); // uncategorized noise

        // Scoped pick always lands on the in-category task.
        for ($i = 0; $i < 5; $i++) {
            [$status, $body] = $this->dispatch('GET', '/api/tasks/next', $sid, [], ['category' => (string) $catId]);
            self::assertSame(200, $status);
            self::assertSame($inCat, $body['task']['id']);
        }

        // A foreign category id on next → 404 (same rule as the list filter).
        [, $otherSid] = $this->makeSessionUser('cat-next-b@test.local');
        [$status] = $this->dispatch('GET', '/api/tasks/next', $otherSid, [], ['category' => (string) $catId]);
        self::assertSame(404, $status);
    }

    public function testCrossUserAccessIs404NotForbidden(): void
    {
        [, $sidA] = $this->makeSessionUser('cat-owner@test.local');
        [, $body] = $this->dispatch('POST', '/api/categories', $sidA, ['name' => 'Mine']);
        $catId = (int) $body['category']['id'];

        [$otherId, $sidB] = $this->makeSessionUser('cat-intruder@test.local');
        [$status] = $this->dispatch('PATCH', "/api/categories/{$catId}", $sidB, ['name' => 'hijacked']);
        self::assertSame(404, $status);
        [$status] = $this->dispatch('DELETE', "/api/categories/{$catId}", $sidB);
        self::assertSame(404, $status);
        [$status] = $this->dispatch('GET', '/api/tasks', $sidB, [], ['categoryId' => (string) $catId, 'limit' => '10']);
        self::assertSame(404, $status);

        // Assigning MY task to YOUR category → 400 (bad input, not a write).
        $taskId = $this->makeTask($otherId, 'low', 5);
        [$status] = $this->dispatch('PATCH', "/api/tasks/{$taskId}", $sidB, ['categoryId' => $catId]);
        self::assertSame(400, $status);
    }

    public function testDeleteUnlabelsTasksAndReportsTheCount(): void
    {
        [$userId, $sid] = $this->makeSessionUser('cat-delete@test.local');
        [, $body] = $this->dispatch('POST', '/api/categories', $sid, ['name' => 'Doomed']);
        $catId = (int) $body['category']['id'];

        $t1 = $this->makeTask($userId, 'low', 5);
        $t2 = $this->makeTask($userId, 'high', 30);
        $this->pdo->prepare('UPDATE tasks SET category_id = ? WHERE id IN (?, ?)')->execute([$catId, $t1, $t2]);

        [$status, $body] = $this->dispatch('DELETE', "/api/categories/{$catId}", $sid);
        self::assertSame(200, $status);
        self::assertSame(2, $body['unlabelledTasks']);

        // The tasks survive, just without the label (FK SET NULL).
        $stmt = $this->pdo->prepare('SELECT COUNT(*), SUM(category_id IS NULL) FROM tasks WHERE user_id = ?');
        $stmt->execute([$userId]);
        [$count, $unlabelled] = $stmt->fetch(\PDO::FETCH_NUM);
        self::assertSame(2, (int) $count);
        self::assertSame(2, (int) $unlabelled);
    }
}

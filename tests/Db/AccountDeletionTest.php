<?php

declare(strict_types=1);

namespace Tests\Db;

use App\Auth\Passwords;
use App\Auth\Sessions;
use App\Controllers\AccountController;
use App\Http\Request;
use App\Http\Router;

/**
 * Account deletion (#266): DELETE /api/account requires the correct password,
 * and one users-row delete cascades EVERY user-owned table (sessions, tasks,
 * projects, points_log, daily_stats, email_tokens) plus sweeps the email-keyed
 * rate_limits buckets (no FK there). Request-level via the #129 harness.
 */
final class AccountDeletionTest extends DbTestCase
{
    private function dispatch(string $method, string $path, string $sid, array $body = []): int
    {
        $account = new AccountController();
        $router = new Router();
        $router->delete('/api/account', [$account, 'destroy'], true);
        $req = new Request($method, $path, [], $body, ['sid' => $sid]);
        http_response_code(200);
        ob_start();
        try {
            $router->dispatch($req);
        } finally {
            ob_end_clean();
        }
        return http_response_code();
    }

    /** @return array{0:int,1:string} user id + sid, with rows in every owned table */
    private function seedFullUser(string $email, string $password): array
    {
        $this->pdo->prepare(
            'INSERT INTO users (email, password_hash, email_verified) VALUES (?, ?, 1)',
        )->execute([$email, Passwords::hash($password)]);
        $userId = (int) $this->pdo->lastInsertId();
        $sid = Sessions::create($userId);

        $this->pdo->prepare('INSERT INTO projects (user_id, name) VALUES (?, ?)')
            ->execute([$userId, 'doomed project']);
        $projectId = (int) $this->pdo->lastInsertId();
        $this->pdo->prepare(
            "INSERT INTO tasks (user_id, title, complexity, estimated_minutes, status, project_id)
             VALUES (?, 'doomed task', 'low', 5, 'done', ?)",
        )->execute([$userId, $projectId]);
        $taskId = (int) $this->pdo->lastInsertId();
        $this->pdo->prepare(
            'INSERT INTO points_log (user_id, task_id, base_points, speed_bonus, multiplier, total_points)
             VALUES (?, ?, 2, 0, 1, 2)',
        )->execute([$userId, $taskId]);
        $this->pdo->prepare(
            "INSERT INTO daily_stats (user_id, stat_date, tasks_completed, points_earned)
             VALUES (?, CURDATE(), 1, 2)",
        )->execute([$userId]);
        $this->pdo->prepare(
            "INSERT INTO email_tokens (user_id, token, type, expires_at)
             VALUES (?, ?, 'verify', DATE_ADD(NOW(), INTERVAL 1 DAY))",
        )->execute([$userId, bin2hex(random_bytes(16))]);
        // An email-keyed rate-limit bucket, as the auth endpoints create.
        $this->pdo->prepare(
            'INSERT INTO rate_limits (bucket, hits, window_start) VALUES (?, 1, NOW())',
        )->execute(['login:' . sha1($email)]);

        return [$userId, $sid];
    }

    private function countRows(string $table, string $where, array $args): int
    {
        $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM {$table} WHERE {$where}");
        $stmt->execute($args);
        return (int) $stmt->fetchColumn();
    }

    public function testWrongPasswordRefusesAndDeletesNothing(): void
    {
        [$userId, $sid] = $this->seedFullUser('doomed-a@test.local', 'correct-horse-1');
        self::assertSame(400, $this->dispatch('DELETE', '/api/account', $sid, ['password' => 'wrong']));
        self::assertSame(1, $this->countRows('users', 'id = ?', [$userId]));
    }

    public function testDeleteRemovesEveryOwnedRow(): void
    {
        $email = 'doomed-b@test.local';
        [$userId, $sid] = $this->seedFullUser($email, 'correct-horse-1');

        self::assertSame(
            204,
            $this->dispatch('DELETE', '/api/account', $sid, ['password' => 'correct-horse-1']),
        );

        foreach (['users' => 'id = ?', 'sessions' => 'user_id = ?', 'tasks' => 'user_id = ?',
            'projects' => 'user_id = ?', 'points_log' => 'user_id = ?',
            'daily_stats' => 'user_id = ?', 'email_tokens' => 'user_id = ?'] as $table => $where) {
            self::assertSame(0, $this->countRows($table, $where, [$userId]), "residue in {$table}");
        }
        self::assertSame(
            0,
            $this->countRows('rate_limits', 'bucket LIKE ?', ['%:' . sha1($email)]),
            'email-keyed rate_limits bucket not swept',
        );
    }
}

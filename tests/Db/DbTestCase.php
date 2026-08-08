<?php

declare(strict_types=1);

namespace Tests\Db;

use App\Db;
use PDO;
use PHPUnit\Framework\TestCase;

/**
 * Base for DB-backed tests. Each test runs inside a transaction that is rolled
 * back in tearDown, so tests never see each other's rows and the schema stays
 * pristine. Point DATABASE_URL at a throwaway `addiapp_test` schema (already
 * migrated) — the harness refuses to run without it, so a stray run can never
 * touch dev/prod data.
 */
abstract class DbTestCase extends TestCase
{
    protected PDO $pdo;

    protected function setUp(): void
    {
        // Treat an empty/whitespace value as unset too: Config maps '' back to the
        // DEFAULT (dev) DB URL, so running here would risk writing to the dev
        // schema instead of the throwaway addiapp_test one.
        $dbUrl = getenv('DATABASE_URL');
        if ($dbUrl === false || trim($dbUrl) === '') {
            self::markTestSkipped('DATABASE_URL not set — DB tests need a migrated addiapp_test schema.');
        }
        $this->pdo = Db::pdo();
        $this->pdo->beginTransaction();
    }

    protected function tearDown(): void
    {
        if (isset($this->pdo) && $this->pdo->inTransaction()) {
            $this->pdo->rollBack();
        }
    }

    /** Create a user and return its id. */
    protected function makeUser(string $email): int
    {
        $this->pdo->prepare(
            'INSERT INTO users (email, password_hash, email_verified) VALUES (?, ?, 1)',
        )->execute([$email, 'x']);
        return (int) $this->pdo->lastInsertId();
    }

    /** Create a backlog task for a user and return its id. */
    protected function makeTask(int $userId, string $complexity, int $estimatedMinutes): int
    {
        $this->pdo->prepare(
            'INSERT INTO tasks (user_id, title, complexity, estimated_minutes) VALUES (?, ?, ?, ?)',
        )->execute([$userId, 'test task', $complexity, $estimatedMinutes]);
        return (int) $this->pdo->lastInsertId();
    }

    /**
     * A task row shaped for Award::awardTaskCompletion (#383) with HONEST
     * timing by default (created 2 h ago, started 1 h ago, completed now — so
     * the too-fast rule doesn't trip) — override any key to probe a rule.
     *
     * @param array<string,mixed> $overrides
     * @return array<string,mixed>
     */
    protected function awardRow(
        int $taskId,
        int $userId,
        string $complexity,
        int $estimatedMinutes,
        ?int $actualMinutes,
        array $overrides = [],
    ): array {
        $now = time();
        return array_merge([
            'id' => $taskId,
            'user_id' => $userId,
            'complexity' => $complexity,
            'estimated_minutes' => $estimatedMinutes,
            'actual_minutes' => $actualMinutes,
            'created_at' => date('Y-m-d H:i:s', $now - 7200),
            'started_at' => date('Y-m-d H:i:s', $now - 3600),
            'completed_at' => date('Y-m-d H:i:s', $now),
            'bonus_forfeited' => 0,
        ], $overrides);
    }

    /**
     * Backdate a task's created_at (and started_at when set) so a request-level
     * complete doesn't trip the #383 too-fast rule — freshly inserted test
     * tasks would otherwise all score 0.
     */
    protected function backdateTask(int $taskId, int $minutes = 120): void
    {
        $this->pdo->prepare(
            'UPDATE tasks SET created_at = DATE_SUB(created_at, INTERVAL ? MINUTE),
                              started_at = IF(started_at IS NULL, NULL, DATE_SUB(started_at, INTERVAL ? MINUTE))
             WHERE id = ?',
        )->execute([$minutes, $minutes, $taskId]);
    }
}

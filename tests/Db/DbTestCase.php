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
}

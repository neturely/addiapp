<?php

declare(strict_types=1);

namespace Tests\Db;

use App\Points\Award;

/**
 * Tier-1 DB regression for award-once idempotency (#74) — the single most
 * important invariant: a task's completion is scored exactly once, ever, even if
 * the complete endpoint fires twice. Enforced by UNIQUE(task_id) on points_log.
 */
final class AwardTest extends DbTestCase
{
    public function testFirstAwardReturnsSpecBreakdown(): void
    {
        $userId = $this->makeUser('award-first@test.local');
        $taskId = $this->makeTask($userId, 'high', 30);

        // High (base 10), done in 15 of 30 min (speed bonus 10), 1st of the day
        // (multiplier 1.00) => total 20.
        $result = Award::awardTaskCompletion($taskId, $userId, 'high', 30, 15);

        self::assertNotNull($result);
        self::assertSame(10, $result['basePoints']);
        self::assertSame(10, $result['speedBonus']);
        self::assertSame(1.0, $result['multiplier']);
        self::assertSame(20, $result['totalPoints']);
    }

    public function testSecondAwardOfSameTaskIsNoOp(): void
    {
        $userId = $this->makeUser('award-dupe@test.local');
        $taskId = $this->makeTask($userId, 'medium', 20);

        $first = Award::awardTaskCompletion($taskId, $userId, 'medium', 20, null);
        $second = Award::awardTaskCompletion($taskId, $userId, 'medium', 20, null);

        self::assertNotNull($first);
        self::assertNull($second, 'a re-complete must not re-award');

        // Exactly one ledger row for the task, and the daily rollup counted once.
        $rows = $this->pdo->prepare('SELECT COUNT(*) FROM points_log WHERE task_id = ?');
        $rows->execute([$taskId]);
        self::assertSame(1, (int) $rows->fetchColumn());

        $done = $this->pdo->prepare('SELECT tasks_completed FROM daily_stats WHERE user_id = ?');
        $done->execute([$userId]);
        self::assertSame(1, (int) $done->fetchColumn());
    }

    public function testDailyMultiplierGrowsAcrossTasksSameDay(): void
    {
        $userId = $this->makeUser('award-mult@test.local');
        $t1 = $this->makeTask($userId, 'low', 10);
        $t2 = $this->makeTask($userId, 'low', 10);

        $first = Award::awardTaskCompletion($t1, $userId, 'low', 10, null);
        $second = Award::awardTaskCompletion($t2, $userId, 'low', 10, null);

        // 1st task of the day earns x1.00, the 2nd earns x1.15.
        self::assertSame(1.0, $first['multiplier']);
        self::assertSame(1.15, $second['multiplier']);
        // base 2, no speed bonus: round(2 * 1.15) = 2.
        self::assertSame(2, $first['totalPoints']);
        self::assertSame(2, $second['totalPoints']);

        // daily_stats persists the LIVE (next) multiplier = multiplier(3) = 1.30.
        $m = $this->pdo->prepare('SELECT multiplier FROM daily_stats WHERE user_id = ?');
        $m->execute([$userId]);
        self::assertSame('1.30', $m->fetchColumn());
    }
}

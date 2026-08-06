<?php

declare(strict_types=1);

namespace App\Notifications;

use PDO;

/**
 * In-app notifications (#366). The only write path in v1 is the lazy
 * activation sweep: there is no persistent process on this hosting, so
 * "a recurring occurrence's available_from date arrived" is detected on the
 * caller's own notifications fetch — the user opens the app and the sweep
 * inserts what accrued while they were away. Nothing runs for idle users.
 */
final class Notifications
{
    public const TYPE_RECURRING_ACTIVATED = 'recurring_activated';

    /** Newest-first list bound for GET /api/notifications. */
    public const LIST_LIMIT = 50;

    /** Read notifications older than this are pruned by the sweep. */
    public const PRUNE_READ_AFTER_DAYS = 30;

    /**
     * Insert a 'recurring_activated' notification for each of the caller's
     * rule-carrying BACKLOG tasks whose available_from is today or earlier
     * ($today is Y-m-d in APP_TIMEZONE — the #250 availability cutoff).
     * Backlog-only: a task the user already started/completed needs no "was
     * added" nudge. `data` snapshots title + rule (the client renders the
     * message); created_at is the activation date, so the list orders by when
     * the task actually came back, not when the sweep happened to run.
     * UNIQUE(type, task_id) + the IGNORE make a re-sweep (or a concurrent
     * double-sweep) a no-op per task — the #74 pattern.
     */
    public static function sweep(PDO $pdo, int $userId, string $today): void
    {
        $stmt = $pdo->prepare(
            "INSERT IGNORE INTO notifications (user_id, type, task_id, data, created_at)
             SELECT t.user_id, ?, t.id,
                    JSON_OBJECT(
                        'title', t.title,
                        'recurrence', CASE
                            WHEN t.recur_day_of_month IS NOT NULL
                                THEN JSON_OBJECT('dayOfMonth', t.recur_day_of_month)
                            ELSE JSON_OBJECT('unit', t.recur_unit, 'interval', t.recur_interval)
                        END
                    ),
                    TIMESTAMP(t.available_from)
             FROM tasks t
             WHERE t.user_id = ?
               AND t.status = 'backlog'
               AND t.available_from IS NOT NULL
               AND t.available_from <= ?
               AND (t.recur_unit IS NOT NULL OR t.recur_day_of_month IS NOT NULL)",
        );
        $stmt->execute([self::TYPE_RECURRING_ACTIVATED, $userId, $today]);
    }

    /** Retention (#366 decision): read rows older than 30 days go; unread never. */
    public static function prune(PDO $pdo, int $userId): void
    {
        $pdo->prepare(
            'DELETE FROM notifications
             WHERE user_id = ? AND read_at IS NOT NULL
               AND read_at < (NOW() - INTERVAL ' . self::PRUNE_READ_AFTER_DAYS . ' DAY)',
        )->execute([$userId]);
    }
}

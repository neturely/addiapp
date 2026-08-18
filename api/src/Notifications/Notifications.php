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

    /** Overrun nudge (#403): a running task way past its estimate. */
    public const TYPE_TASK_OVERRUN = 'task_overrun';
    /** Overrun auto-return (#403): the sweep sent it back to Ready. */
    public const TYPE_TASK_RETURNED = 'task_returned';

    /**
     * #403 thresholds (user decision): at WARN × estimate a nudge notification
     * fires ("finish it or it goes back to Ready"); at RETURN × estimate the
     * sweep moves the task back to Ready itself. Users own the time they put
     * on tasks — the warning stage keeps the auto-return from yanking work
     * that's merely slow.
     */
    public const OVERRUN_WARN_RATIO = 3;
    public const OVERRUN_RETURN_RATIO = 5;

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

    /**
     * Overrun sweep (#403) — same lazy-detection pattern as sweep(): runs on
     * the caller's notifications fetch. Two stages, RETURN first so a task
     * discovered already past the return threshold (abandoned overnight) gets
     * ONE "sent back to Ready" notice, never a same-fetch warn + return pair.
     *
     * Stage RETURN (≥ RETURN × estimate): notify, then move the task back to
     * Ready via the normal pause semantics (started_at/completed_at/
     * actual_minutes cleared, bonus_forfeited set sticky — moot points-wise
     * past the estimate, but consistent with the #383 transition). The
     * superseded warn row is deleted (its "finish it or it goes back" is no
     * longer true). Stage WARN (≥ WARN × estimate): INSERT IGNORE the nudge.
     *
     * Dedupe = UNIQUE(type, task_id) per run: a STATUS TRANSITION clears the
     * task's overrun-family rows (removeOverrunForTask, called from the task
     * PATCH), so a restarted task re-arms both stages for its new run while a
     * single run can never double-notify. `data` snapshots title + estimate +
     * elapsed at detection; created_at is the detection moment (unlike the
     * recurring sweep there's no earlier "true" date to pin).
     */
    public static function sweepOverrun(PDO $pdo, int $userId): void
    {
        $overdue = "t.user_id = ?
               AND t.status = 'in_progress'
               AND t.started_at IS NOT NULL
               AND TIMESTAMPDIFF(SECOND, t.started_at, NOW()) >= ? * t.estimated_minutes * 60";
        // returnRatio rides the snapshot so the client never hardcodes the
        // threshold it warns about.
        $snapshot = "JSON_OBJECT(
                        'title', t.title,
                        'estimatedMinutes', t.estimated_minutes,
                        'elapsedMinutes', TIMESTAMPDIFF(MINUTE, t.started_at, NOW()),
                        'returnRatio', CAST(? AS UNSIGNED)
                    )";

        // RETURN stage — notify while the row still carries its run timing…
        $pdo->prepare(
            "INSERT IGNORE INTO notifications (user_id, type, task_id, data)
             SELECT t.user_id, ?, t.id, {$snapshot} FROM tasks t WHERE {$overdue}",
        )->execute([self::TYPE_TASK_RETURNED, self::OVERRUN_RETURN_RATIO, $userId, self::OVERRUN_RETURN_RATIO]);
        // …drop the superseded warn…
        $pdo->prepare(
            "DELETE n FROM notifications n
             JOIN tasks t ON t.id = n.task_id
             WHERE n.type = ? AND {$overdue}",
        )->execute([self::TYPE_TASK_OVERRUN, $userId, self::OVERRUN_RETURN_RATIO]);
        // …then perform the return (the #383 pause transition's exact SETs).
        $pdo->prepare(
            "UPDATE tasks t
             SET t.status = 'backlog', t.started_at = NULL, t.completed_at = NULL,
                 t.actual_minutes = NULL, t.bonus_forfeited = 1
             WHERE {$overdue}",
        )->execute([$userId, self::OVERRUN_RETURN_RATIO]);

        // WARN stage — anything still running past the warn threshold.
        $pdo->prepare(
            "INSERT IGNORE INTO notifications (user_id, type, task_id, data)
             SELECT t.user_id, ?, t.id, {$snapshot} FROM tasks t WHERE {$overdue}",
        )->execute([self::TYPE_TASK_OVERRUN, self::OVERRUN_RETURN_RATIO, $userId, self::OVERRUN_WARN_RATIO]);
    }

    /**
     * Clear a task's overrun-family notifications (#403) — called on any
     * status transition: a manual send-back makes the warn stale, and a
     * restart begins a NEW run that must be able to warn/return again (the
     * dedupe anchor is per run here, unlike the recurring type's per-task
     * anchor). Completion needs no special case — removeForTask covers it.
     */
    public static function removeOverrunForTask(PDO $pdo, int $taskId, int $userId): void
    {
        $pdo->prepare(
            'DELETE FROM notifications WHERE task_id = ? AND user_id = ? AND type IN (?, ?)',
        )->execute([$taskId, $userId, self::TYPE_TASK_OVERRUN, self::TYPE_TASK_RETURNED]);
    }

    /**
     * Retention (#366 decision): read or dismissed rows older than 30 days go;
     * unread-and-undismissed never. (A pruned dismissed row whose task is STILL
     * due releases the dedupe anchor — a 30-days-later re-notify for a task
     * still sitting in the backlog is accepted, arguably a feature.)
     */
    public static function prune(PDO $pdo, int $userId): void
    {
        $pdo->prepare(
            'DELETE FROM notifications
             WHERE user_id = ?
               AND ((read_at IS NOT NULL AND read_at < (NOW() - INTERVAL ' . self::PRUNE_READ_AFTER_DAYS . ' DAY))
                 OR (dismissed_at IS NOT NULL AND dismissed_at < (NOW() - INTERVAL ' . self::PRUNE_READ_AFTER_DAYS . ' DAY)))',
        )->execute([$userId]);
    }

    /**
     * Hard-remove a task's notifications — the completion path's cleanup
     * (#366 user feedback: a done task's "it came back" notice is moot). Task
     * DELETION needs no call — the FK cascades. Safe to hard-delete here,
     * unlike a user dismiss: a done task fails the sweep's backlog condition,
     * so nothing resurrects.
     */
    public static function removeForTask(PDO $pdo, int $taskId, int $userId): void
    {
        $pdo->prepare('DELETE FROM notifications WHERE task_id = ? AND user_id = ?')
            ->execute([$taskId, $userId]);
    }
}

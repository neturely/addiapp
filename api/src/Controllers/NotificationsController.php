<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Db;
use App\Http\Request;
use App\Http\Response;
use App\Notifications\Notifications;
use App\Points\PointsConfig;
use App\Support\Timestamps;

/**
 * In-app notifications (#366): the caller's list + unread count, with the lazy
 * activation sweep (and retention prune) run first — the fetch itself is what
 * discovers "your recurring task came back" on this no-daemon hosting. Thin
 * controller per the repo rule; the sweep/prune SQL lives in App\Notifications.
 */
final class NotificationsController
{
    /** GET /api/notifications — sweep, prune, then newest-first list + unreadCount. */
    public function index(Request $req, array $params): void
    {
        $pdo = Db::pdo();
        $userId = (int) $req->userId;
        $today = (new \DateTimeImmutable('now', new \DateTimeZone(PointsConfig::timezone())))->format('Y-m-d');

        Notifications::sweep($pdo, $userId, $today);
        Notifications::prune($pdo, $userId);

        $stmt = $pdo->prepare(
            'SELECT * FROM notifications WHERE user_id = ? AND dismissed_at IS NULL
             ORDER BY created_at DESC, id DESC LIMIT ' . Notifications::LIST_LIMIT,
        );
        $stmt->execute([$userId]);
        $rows = $stmt->fetchAll();

        $unread = $pdo->prepare(
            'SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL AND dismissed_at IS NULL',
        );
        $unread->execute([$userId]);
        // Total in the view (dismissed excluded) — served, not derived from the
        // list, which is capped at LIST_LIMIT. Drives the header badge: amber
        // when the view has items, red when some are new (user decision).
        $total = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND dismissed_at IS NULL');
        $total->execute([$userId]);

        Response::json([
            'notifications' => array_map([self::class, 'mapNotification'], $rows),
            'unreadCount' => (int) $unread->fetchColumn(),
            'totalCount' => (int) $total->fetchColumn(),
        ]);
    }

    /** POST /api/notifications/read — mark ALL read (v1 decision; per-item can wait). */
    public function readAll(Request $req, array $params): void
    {
        Db::pdo()->prepare(
            'UPDATE notifications SET read_at = NOW()
             WHERE user_id = ? AND read_at IS NULL AND dismissed_at IS NULL',
        )->execute([$req->userId]);
        Response::json(['ok' => true]);
    }

    /**
     * DELETE /api/notifications/{id} — dismiss one notification. A SOFT delete
     * (`dismissed_at`): the row must survive as the sweep's dedupe anchor, or
     * the next fetch would just re-insert a notification for a task that's
     * still due (see the migration 031 comment). 404-not-403 (#129).
     */
    public function destroy(Request $req, array $params): void
    {
        $raw = $params['id'];
        $id = ctype_digit($raw) && (int) $raw > 0 ? (int) $raw : null;
        if ($id === null) {
            Response::error('Invalid notification id', 400);
            return;
        }

        $pdo = Db::pdo();
        $stmt = $pdo->prepare(
            'UPDATE notifications SET dismissed_at = NOW(), read_at = IFNULL(read_at, NOW())
             WHERE id = ? AND user_id = ? AND dismissed_at IS NULL',
        );
        $stmt->execute([$id, $req->userId]);
        if ($stmt->rowCount() === 0) {
            Response::error('Notification not found', 404);
            return;
        }
        Response::json(['ok' => true]);
    }

    /** @param array<string,mixed> $r */
    private static function mapNotification(array $r): array
    {
        $data = json_decode((string) $r['data'], true);
        return [
            'id' => (int) $r['id'],
            'type' => $r['type'],
            'taskId' => $r['task_id'] !== null ? (int) $r['task_id'] : null,
            'data' => is_array($data) ? $data : [],
            'createdAt' => Timestamps::iso($r['created_at']),
            'readAt' => $r['read_at'] !== null ? Timestamps::iso($r['read_at']) : null,
        ];
    }
}

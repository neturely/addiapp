<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Db;
use App\Http\Request;
use App\Http\Response;
use App\Points\Award;
use App\Support\Timestamps;
use App\Tasks\Selection;
use PDO;

final class TasksController
{
    private const COMPLEXITY = ['low', 'medium', 'high'];
    private const STATUS = ['backlog', 'in_progress', 'done'];
    private const MAX_MINUTES = 100000;

    /** Play-mode win type → task complexity (medium sits in both pools). */
    private const WIN_TYPE_COMPLEXITY = [
        'small' => ['low', 'medium'],
        'big' => ['medium', 'high'],
    ];

    /** GET /api/tasks?status=backlog|in_progress|done */
    public function index(Request $req, array $params): void
    {
        $conditions = ['user_id = ?'];
        $args = [$req->userId];

        $status = $req->query('status');
        if ($status !== null) {
            if (!in_array($status, self::STATUS, true)) {
                Response::error('Invalid status filter', 400);
                return;
            }
            $conditions[] = 'status = ?';
            $args[] = $status;
        }

        $stmt = Db::pdo()->prepare(
            'SELECT * FROM tasks WHERE ' . implode(' AND ', $conditions) . ' ORDER BY created_at DESC',
        );
        $stmt->execute($args);
        Response::json(['tasks' => array_map([self::class, 'mapTask'], $stmt->fetchAll())]);
    }

    /** GET /api/tasks/next?size=small|big&minutes=15&exclude=42 */
    public function next(Request $req, array $params): void
    {
        $size = $req->query('size');
        if ($size !== null && !isset(self::WIN_TYPE_COMPLEXITY[$size])) {
            Response::error('Invalid filters', 400);
            return;
        }
        $minutes = self::positiveInt($req->query('minutes'));
        if ($req->query('minutes') !== null && $minutes === null) {
            Response::error('Invalid filters', 400);
            return;
        }
        $exclude = self::positiveInt($req->query('exclude'));
        if ($req->query('exclude') !== null && $exclude === null) {
            Response::error('Invalid filters', 400);
            return;
        }

        $conditions = ['user_id = ?', "status = 'backlog'"];
        $args = [$req->userId];
        if ($size !== null) {
            $set = self::WIN_TYPE_COMPLEXITY[$size];
            $conditions[] = 'complexity IN (' . implode(',', array_fill(0, count($set), '?')) . ')';
            $args = array_merge($args, $set);
        }
        if ($minutes !== null) {
            $conditions[] = 'estimated_minutes <= ?';
            $args[] = $minutes;
        }
        if ($exclude !== null) {
            $conditions[] = 'id <> ?';
            $args[] = $exclude;
        }

        $stmt = Db::pdo()->prepare('SELECT * FROM tasks WHERE ' . implode(' AND ', $conditions));
        $stmt->execute($args);
        $candidates = array_map([self::class, 'mapTask'], $stmt->fetchAll());
        Response::json(['task' => Selection::pick($candidates)]);
    }

    /** POST /api/tasks */
    public function create(Request $req, array $params): void
    {
        $title = self::title($req->input('title'));
        $complexity = self::enum($req->input('complexity'), self::COMPLEXITY);
        $minutes = self::minutes($req->input('estimatedMinutes'));

        if ($title === null || $complexity === null || $minutes === null) {
            Response::error('Invalid input', 400);
            return;
        }

        $pdo = Db::pdo();
        $pdo->prepare('INSERT INTO tasks (user_id, title, complexity, estimated_minutes) VALUES (?, ?, ?, ?)')
            ->execute([$req->userId, $title, $complexity, $minutes]);
        Response::json(['task' => self::mapTask(self::findOwned($pdo, (int) $pdo->lastInsertId(), (int) $req->userId))], 201);
    }

    /** GET /api/tasks/{id} */
    public function show(Request $req, array $params): void
    {
        $id = self::parseId($params['id']);
        if ($id === null) {
            Response::error('Invalid task id', 400);
            return;
        }
        $task = self::findOwned(Db::pdo(), $id, (int) $req->userId);
        if ($task === null) {
            Response::error('Task not found', 404);
            return;
        }
        Response::json(['task' => self::mapTask($task)]);
    }

    /** PATCH /api/tasks/{id} */
    public function update(Request $req, array $params): void
    {
        $id = self::parseId($params['id']);
        if ($id === null) {
            Response::error('Invalid task id', 400);
            return;
        }

        $sets = [];
        $args = [];

        if (array_key_exists('title', $req->body)) {
            $title = self::title($req->input('title'));
            if ($title === null) {
                Response::error('Invalid input', 400);
                return;
            }
            $sets[] = 'title = ?';
            $args[] = $title;
        }
        if (array_key_exists('complexity', $req->body)) {
            $c = self::enum($req->input('complexity'), self::COMPLEXITY);
            if ($c === null) {
                Response::error('Invalid input', 400);
                return;
            }
            $sets[] = 'complexity = ?';
            $args[] = $c;
        }
        if (array_key_exists('estimatedMinutes', $req->body)) {
            $m = self::minutes($req->input('estimatedMinutes'));
            if ($m === null) {
                Response::error('Invalid input', 400);
                return;
            }
            $sets[] = 'estimated_minutes = ?';
            $args[] = $m;
        }

        $newStatus = null;
        if (array_key_exists('status', $req->body)) {
            $newStatus = self::enum($req->input('status'), self::STATUS);
            if ($newStatus === null) {
                Response::error('Invalid input', 400);
                return;
            }
        }

        if (count($sets) === 0 && $newStatus === null) {
            Response::error('No fields to update', 400);
            return;
        }

        $pdo = Db::pdo();
        $existing = self::findOwned($pdo, $id, (int) $req->userId);
        if ($existing === null) {
            Response::error('Task not found', 404);
            return;
        }

        $completing = false;
        if ($newStatus !== null) {
            $sets[] = 'status = ?';
            $args[] = $newStatus;

            if ($newStatus !== $existing['status']) {
                // Lifecycle timestamps derived from the transition (matches TS).
                if ($newStatus === 'in_progress') {
                    if ($existing['started_at'] === null) {
                        $sets[] = 'started_at = NOW()';
                    }
                } elseif ($newStatus === 'done') {
                    $sets[] = 'completed_at = NOW()';
                    if ($existing['started_at'] !== null) {
                        $sets[] = 'actual_minutes = GREATEST(0, ROUND(TIMESTAMPDIFF(SECOND, started_at, NOW()) / 60))';
                    }
                    $completing = $existing['status'] !== 'done';
                } else { // backlog — clear lifecycle timing
                    $sets[] = 'started_at = NULL';
                    $sets[] = 'completed_at = NULL';
                    $sets[] = 'actual_minutes = NULL';
                }
            }
        }

        $args[] = $id;
        $args[] = $req->userId;
        $pdo->prepare('UPDATE tasks SET ' . implode(', ', $sets) . ' WHERE id = ? AND user_id = ?')->execute($args);

        $updated = self::findOwned($pdo, $id, (int) $req->userId);

        $pointsAwarded = null;
        if ($completing && $updated !== null) {
            $pointsAwarded = Award::awardTaskCompletion(
                (int) $updated['id'],
                (int) $updated['user_id'],
                $updated['complexity'],
                (int) $updated['estimated_minutes'],
                $updated['actual_minutes'] !== null ? (int) $updated['actual_minutes'] : null,
            );
        }

        $body = ['task' => self::mapTask($updated)];
        if ($pointsAwarded !== null) {
            $body['pointsAwarded'] = $pointsAwarded;
        }
        Response::json($body);
    }

    /** DELETE /api/tasks/{id} */
    public function destroy(Request $req, array $params): void
    {
        $id = self::parseId($params['id']);
        if ($id === null) {
            Response::error('Invalid task id', 400);
            return;
        }
        $pdo = Db::pdo();
        if (self::findOwned($pdo, $id, (int) $req->userId) === null) {
            Response::error('Task not found', 404);
            return;
        }
        $pdo->prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?')->execute([$id, $req->userId]);
        Response::noContent();
    }

    // --- helpers ---

    private static function findOwned(PDO $pdo, int $id, int $userId): ?array
    {
        $stmt = $pdo->prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ? LIMIT 1');
        $stmt->execute([$id, $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    private static function mapTask(array $r): array
    {
        return [
            'id' => (int) $r['id'],
            'userId' => (int) $r['user_id'],
            'title' => $r['title'],
            'complexity' => $r['complexity'],
            'estimatedMinutes' => (int) $r['estimated_minutes'],
            'status' => $r['status'],
            'startedAt' => Timestamps::iso($r['started_at']),
            'completedAt' => Timestamps::iso($r['completed_at']),
            'actualMinutes' => $r['actual_minutes'] !== null ? (int) $r['actual_minutes'] : null,
            'createdAt' => Timestamps::iso($r['created_at']),
            'updatedAt' => Timestamps::iso($r['updated_at']),
        ];
    }

    private static function parseId(string $raw): ?int
    {
        return ctype_digit($raw) && (int) $raw > 0 ? (int) $raw : null;
    }

    private static function positiveInt(?string $raw): ?int
    {
        if ($raw === null || !ctype_digit($raw)) {
            return null;
        }
        $n = (int) $raw;
        return $n > 0 ? $n : null;
    }

    private static function title(mixed $v): ?string
    {
        if (!is_string($v)) {
            return null;
        }
        $t = trim($v);
        return $t !== '' && mb_strlen($t) <= 255 ? $t : null;
    }

    private static function enum(mixed $v, array $allowed): ?string
    {
        return is_string($v) && in_array($v, $allowed, true) ? $v : null;
    }

    private static function minutes(mixed $v): ?int
    {
        if (!is_int($v)) {
            return null;
        }
        return $v >= 1 && $v <= self::MAX_MINUTES ? $v : null;
    }
}

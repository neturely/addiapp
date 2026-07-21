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
    /** Upper bound on the opt-in dashboard page size (#100). */
    private const MAX_PAGE_SIZE = 100;

    /** Play-mode win type → task complexity (medium sits in both pools). */
    private const WIN_TYPE_COMPLEXITY = [
        'small' => ['low', 'medium'],
        'big' => ['medium', 'high'],
    ];

    /**
     * GET /api/tasks?status=backlog|in_progress|done[&limit=25&before=<id>]
     *
     * Opt-in keyset pagination (#100): with no `limit`, returns the full list
     * (unchanged legacy behaviour — InProgressProvider and any future caller keep
     * working). With `limit`, appends rows older than the `before` id cursor
     * (`id DESC`, monotonic == created_at order) and returns `nextCursor`; the
     * first page (no `before`) also returns per-status `counts` — one GROUP BY
     * that restores the tab counts server-side filtering would otherwise break.
     */
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

        // Unassigned filter (#236): tasks with no project, across all statuses (a
        // different axis than the status tabs). Covered by the (user_id, project_id)
        // index from #234's migration 010.
        if ($req->query('unassigned') === '1') {
            $conditions[] = 'project_id IS NULL';
        }

        $paginated = $req->query('limit') !== null;
        if (!$paginated) {
            $stmt = Db::pdo()->prepare(
                'SELECT * FROM tasks WHERE ' . implode(' AND ', $conditions) . ' ORDER BY id DESC',
            );
            $stmt->execute($args);
            Response::json(['tasks' => array_map([self::class, 'mapTask'], $stmt->fetchAll())]);
            return;
        }

        $limit = self::positiveInt($req->query('limit'));
        if ($limit === null || $limit > self::MAX_PAGE_SIZE) {
            Response::error('Invalid limit', 400);
            return;
        }

        $before = $req->query('before');
        $firstPage = $before === null;
        if (!$firstPage) {
            $cursor = self::positiveInt($before);
            if ($cursor === null) {
                Response::error('Invalid cursor', 400);
                return;
            }
            $conditions[] = 'id < ?';
            $args[] = $cursor;
        }

        // Fetch one extra row to detect whether a further page exists.
        $stmt = Db::pdo()->prepare(
            'SELECT * FROM tasks WHERE ' . implode(' AND ', $conditions)
            . ' ORDER BY id DESC LIMIT ' . ($limit + 1),
        );
        $stmt->execute($args);
        $rows = $stmt->fetchAll();

        $nextCursor = null;
        if (count($rows) > $limit) {
            $rows = array_slice($rows, 0, $limit);
            $nextCursor = (int) $rows[count($rows) - 1]['id'];
        }

        $payload = [
            'tasks' => array_map([self::class, 'mapTask'], $rows),
            'nextCursor' => $nextCursor,
        ];
        if ($firstPage) {
            $payload['counts'] = self::statusCounts(Db::pdo(), $req->userId);
        }
        Response::json($payload);
    }

    /**
     * Per-status task counts for the dashboard tab bar (#100), plus `all` and
     * `unassigned` (#236 — `project_id IS NULL`, its own axis so it's a separate
     * count, not part of the status GROUP BY).
     */
    private static function statusCounts(PDO $pdo, int $userId): array
    {
        $stmt = $pdo->prepare('SELECT status, COUNT(*) AS c FROM tasks WHERE user_id = ? GROUP BY status');
        $stmt->execute([$userId]);
        $counts = ['all' => 0, 'backlog' => 0, 'in_progress' => 0, 'done' => 0];
        foreach ($stmt->fetchAll() as $row) {
            $n = (int) $row['c'];
            $counts[$row['status']] = $n;
            $counts['all'] += $n;
        }

        $u = $pdo->prepare('SELECT COUNT(*) FROM tasks WHERE user_id = ? AND project_id IS NULL');
        $u->execute([$userId]);
        $counts['unassigned'] = (int) $u->fetchColumn();

        return $counts;
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

        $description = null;
        if (array_key_exists('description', $req->body)) {
            $description = self::description($req->input('description'));
            if ($description === false) {
                Response::error('Invalid input', 400);
                return;
            }
        }

        // Optional project (#234): a task may be created directly into an active
        // project the caller owns; anything else (bad shape, foreign/archived id) → 400.
        $projectId = null;
        if (array_key_exists('projectId', $req->body)) {
            $projectId = self::positiveIntValue($req->input('projectId'));
            if ($req->input('projectId') !== null && $projectId === null) {
                Response::error('Invalid input', 400);
                return;
            }
        }

        $pdo = Db::pdo();
        if ($projectId !== null && !self::isActiveOwnedProject($pdo, $projectId, (int) $req->userId)) {
            Response::error('Invalid input', 400);
            return;
        }
        $pdo->prepare('INSERT INTO tasks (user_id, title, description, complexity, estimated_minutes, project_id) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$req->userId, $title, $description, $complexity, $minutes, $projectId]);

        $created = self::findOwned($pdo, (int) $pdo->lastInsertId(), (int) $req->userId);
        if ($created === null) {
            Response::error('Failed to load created task', 500);
            return;
        }
        Response::json(['task' => self::mapTask($created)], 201);
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
        if (array_key_exists('description', $req->body)) {
            $description = self::description($req->input('description'));
            if ($description === false) {
                Response::error('Invalid input', 400);
                return;
            }
            $sets[] = 'description = ?';
            $args[] = $description;
        }

        // Assign / unassign a project (#236): projectId=null unassigns; a positive
        // int assigns (validated active + owned below, once $pdo is in hand). $assign
        // stays `false` when the key is absent (distinct from a null "unassign").
        $assign = false;
        if (array_key_exists('projectId', $req->body)) {
            $raw = $req->input('projectId');
            if ($raw === null) {
                $assign = null;
            } else {
                $assign = self::positiveIntValue($raw);
                if ($assign === null) {
                    Response::error('Invalid input', 400);
                    return;
                }
            }
            $sets[] = 'project_id = ?';
            $args[] = $assign;
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

        // A non-null project assignment must reference an active project the caller
        // owns (a foreign/archived id → 400, not a silent write).
        if (is_int($assign) && !self::isActiveOwnedProject($pdo, $assign, (int) $req->userId)) {
            Response::error('Invalid input', 400);
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
        if ($updated === null) {
            // Concurrent delete between UPDATE and reload — the task is gone.
            Response::error('Task not found', 404);
            return;
        }

        $pointsAwarded = null;
        if ($completing) {
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
            'description' => $r['description'],
            'complexity' => $r['complexity'],
            'estimatedMinutes' => (int) $r['estimated_minutes'],
            'status' => $r['status'],
            'projectId' => $r['project_id'] !== null ? (int) $r['project_id'] : null,
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

    /** A positive int from a typed JSON body value (projectId); null otherwise. */
    private static function positiveIntValue(mixed $v): ?int
    {
        return is_int($v) && $v > 0 ? $v : null;
    }

    /** True if $id is an active project owned by $userId (for task assignment). */
    private static function isActiveOwnedProject(PDO $pdo, int $id, int $userId): bool
    {
        $stmt = $pdo->prepare("SELECT 1 FROM projects WHERE id = ? AND user_id = ? AND status = 'active' LIMIT 1");
        $stmt->execute([$id, $userId]);
        return $stmt->fetch() !== false;
    }

    private static function title(mixed $v): ?string
    {
        if (!is_string($v)) {
            return null;
        }
        $t = trim($v);
        return $t !== '' && mb_strlen($t) <= 255 ? $t : null;
    }

    /**
     * Optional description (#184): trimmed, empty → null (so "has a description"
     * is unambiguous). Returns null (absent/empty) | string (valid) | false
     * (present but invalid: not a string, or over the 1000-char cap).
     */
    private static function description(mixed $v): string|false|null
    {
        if ($v === null) {
            return null;
        }
        if (!is_string($v)) {
            return false;
        }
        $t = trim($v);
        if (mb_strlen($t) > 1000) {
            return false;
        }
        return $t === '' ? null : $t;
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

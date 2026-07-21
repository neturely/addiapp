<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Db;
use App\Http\Request;
use App\Http\Response;
use App\Support\Timestamps;
use PDO;

/**
 * Projects (#234, epic #233): user-scoped grouping of tasks. Mirrors
 * TasksController's conventions — thin controller, PDO parameterized queries,
 * findOwned* ownership helpers, and 404-not-403 for non-owners (#129) so a
 * project id can't be probed across users.
 */
final class ProjectsController
{
    private const STATUS = ['active', 'archived'];

    /**
     * GET /api/projects — the user's ACTIVE projects, each with remaining +
     * total task counts for the "3 of 7 remaining" sub-label. total = every
     * task in the project; remaining = status <> 'done'. One grouped query
     * (LEFT JOIN so a project with no tasks still returns 0/0).
     */
    public function index(Request $req, array $params): void
    {
        $stmt = Db::pdo()->prepare(
            'SELECT p.*,
                    COUNT(t.id) AS total_count,
                    SUM(CASE WHEN t.status <> \'done\' THEN 1 ELSE 0 END) AS remaining_count
             FROM projects p
             LEFT JOIN tasks t ON t.project_id = p.id AND t.user_id = p.user_id
             WHERE p.user_id = ? AND p.status = \'active\'
             GROUP BY p.id
             ORDER BY p.id DESC',
        );
        $stmt->execute([$req->userId]);
        Response::json(['projects' => array_map([self::class, 'mapProject'], $stmt->fetchAll())]);
    }

    /** POST /api/projects — create an active project. */
    public function create(Request $req, array $params): void
    {
        $name = self::name($req->input('name'));
        if ($name === null) {
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

        $pdo = Db::pdo();
        $pdo->prepare('INSERT INTO projects (user_id, name, description) VALUES (?, ?, ?)')
            ->execute([$req->userId, $name, $description]);

        $created = self::loadWithCounts($pdo, (int) $pdo->lastInsertId(), (int) $req->userId);
        if ($created === null) {
            Response::error('Failed to load created project', 500);
            return;
        }
        Response::json(['project' => self::mapProject($created)], 201);
    }

    /**
     * PATCH /api/projects/{id} — update name/description and/or status
     * (Archive = status:'archived', the terminal/completed state).
     */
    public function update(Request $req, array $params): void
    {
        $id = self::parseId($params['id']);
        if ($id === null) {
            Response::error('Invalid project id', 400);
            return;
        }

        $sets = [];
        $args = [];

        if (array_key_exists('name', $req->body)) {
            $name = self::name($req->input('name'));
            if ($name === null) {
                Response::error('Invalid input', 400);
                return;
            }
            $sets[] = 'name = ?';
            $args[] = $name;
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
        if (array_key_exists('status', $req->body)) {
            $status = self::enum($req->input('status'), self::STATUS);
            if ($status === null) {
                Response::error('Invalid input', 400);
                return;
            }
            $sets[] = 'status = ?';
            $args[] = $status;
        }

        if (count($sets) === 0) {
            Response::error('No fields to update', 400);
            return;
        }

        $pdo = Db::pdo();
        if (self::findOwnedProject($pdo, $id, (int) $req->userId) === null) {
            Response::error('Project not found', 404);
            return;
        }

        $args[] = $id;
        $args[] = $req->userId;
        $pdo->prepare('UPDATE projects SET ' . implode(', ', $sets) . ' WHERE id = ? AND user_id = ?')
            ->execute($args);

        $updated = self::loadWithCounts($pdo, $id, (int) $req->userId);
        if ($updated === null) {
            Response::error('Project not found', 404);
            return;
        }
        Response::json(['project' => self::mapProject($updated)]);
    }

    // --- helpers ---

    /**
     * Plain ownership lookup (no counts) — for validation/ownership checks,
     * including TasksController's active-project guard on task create.
     */
    public static function findOwnedProject(PDO $pdo, int $id, int $userId): ?array
    {
        $stmt = $pdo->prepare('SELECT * FROM projects WHERE id = ? AND user_id = ? LIMIT 1');
        $stmt->execute([$id, $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** Single-project version of the grouped count query, for create/patch responses. */
    private static function loadWithCounts(PDO $pdo, int $id, int $userId): ?array
    {
        $stmt = $pdo->prepare(
            'SELECT p.*,
                    COUNT(t.id) AS total_count,
                    SUM(CASE WHEN t.status <> \'done\' THEN 1 ELSE 0 END) AS remaining_count
             FROM projects p
             LEFT JOIN tasks t ON t.project_id = p.id AND t.user_id = p.user_id
             WHERE p.id = ? AND p.user_id = ?
             GROUP BY p.id',
        );
        $stmt->execute([$id, $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    private static function mapProject(array $r): array
    {
        return [
            'id' => (int) $r['id'],
            'userId' => (int) $r['user_id'],
            'name' => $r['name'],
            'description' => $r['description'],
            'status' => $r['status'],
            // SUM over an empty LEFT JOIN group is NULL — coalesce to 0.
            'totalCount' => (int) ($r['total_count'] ?? 0),
            'remainingCount' => (int) ($r['remaining_count'] ?? 0),
            'createdAt' => Timestamps::iso($r['created_at']),
            'updatedAt' => Timestamps::iso($r['updated_at']),
        ];
    }

    private static function parseId(string $raw): ?int
    {
        return ctype_digit($raw) && (int) $raw > 0 ? (int) $raw : null;
    }

    private static function name(mixed $v): ?string
    {
        if (!is_string($v)) {
            return null;
        }
        $t = trim($v);
        return $t !== '' && mb_strlen($t) <= 255 ? $t : null;
    }

    /**
     * Optional description: trimmed, empty → null. Returns null (absent/empty) |
     * string (valid) | false (present but invalid). Mirrors TasksController.
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
}

<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Db;
use App\Http\Request;
use App\Http\Response;
use App\Support\Timestamps;
use PDO;

/**
 * User-defined task categories (#276): lightweight custom lists in the rail — a
 * second task axis beside status, mirroring the Projects model (#234) minus the
 * lifecycle machinery (no statuses, no archive gate: a category is a label, so
 * DELETE is direct and only ever unassigns tasks). Same conventions: thin
 * controller, parameterized PDO, findOwned* helper, 404-not-403 (#129).
 */
final class CategoriesController
{
    /**
     * GET /api/categories — the user's categories, each with remaining + total
     * task counts (remaining = status <> 'done', the rail's figure). One
     * grouped LEFT JOIN like the projects list.
     */
    public function index(Request $req, array $params): void
    {
        $stmt = Db::pdo()->prepare(
            'SELECT c.*,
                    COUNT(t.id) AS total_count,
                    SUM(CASE WHEN t.status <> \'done\' THEN 1 ELSE 0 END) AS remaining_count
             FROM task_categories c
             LEFT JOIN tasks t ON t.category_id = c.id AND t.user_id = c.user_id
             WHERE c.user_id = ?
             GROUP BY c.id
             ORDER BY c.id DESC',
        );
        $stmt->execute([$req->userId]);
        Response::json(['categories' => array_map([self::class, 'mapCategory'], $stmt->fetchAll())]);
    }

    /** POST /api/categories — create a category (name + optional palette colour). */
    public function create(Request $req, array $params): void
    {
        $name = self::name($req->input('name'));
        if ($name === null) {
            Response::error('Invalid input', 400);
            return;
        }
        $color = 0;
        if (array_key_exists('color', $req->body)) {
            $parsed = self::color($req->input('color'));
            if ($parsed === null) {
                Response::error('Invalid input', 400);
                return;
            }
            $color = $parsed;
        }

        $pdo = Db::pdo();
        $pdo->prepare('INSERT INTO task_categories (user_id, name, color) VALUES (?, ?, ?)')
            ->execute([$req->userId, $name, $color]);

        $created = self::loadWithCounts($pdo, (int) $pdo->lastInsertId(), (int) $req->userId);
        if ($created === null) {
            Response::error('Failed to load created category', 500);
            return;
        }
        Response::json(['category' => self::mapCategory($created)], 201);
    }

    /** PATCH /api/categories/{id} — rename and/or recolour. */
    public function update(Request $req, array $params): void
    {
        $id = self::parseId($params['id']);
        if ($id === null) {
            Response::error('Invalid category id', 400);
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
        if (array_key_exists('color', $req->body)) {
            $color = self::color($req->input('color'));
            if ($color === null) {
                Response::error('Invalid input', 400);
                return;
            }
            $sets[] = 'color = ?';
            $args[] = $color;
        }
        if (count($sets) === 0) {
            Response::error('No fields to update', 400);
            return;
        }

        $pdo = Db::pdo();
        if (self::findOwnedCategory($pdo, $id, (int) $req->userId) === null) {
            Response::error('Category not found', 404);
            return;
        }

        $args[] = $id;
        $args[] = $req->userId;
        $pdo->prepare('UPDATE task_categories SET ' . implode(', ', $sets) . ' WHERE id = ? AND user_id = ?')
            ->execute($args);

        $updated = self::loadWithCounts($pdo, $id, (int) $req->userId);
        if ($updated === null) {
            Response::error('Category not found', 404);
            return;
        }
        Response::json(['category' => self::mapCategory($updated)]);
    }

    /**
     * DELETE /api/categories/{id} — direct permanent delete (no archive gate: a
     * category is a label, not a container of work). Tasks are never deleted —
     * the FK is ON DELETE SET NULL (migration 024), so they just lose the
     * label; the count rides the response for the client's toast.
     */
    public function destroy(Request $req, array $params): void
    {
        $id = self::parseId($params['id']);
        if ($id === null) {
            Response::error('Invalid category id', 400);
            return;
        }

        $pdo = Db::pdo();
        if (self::findOwnedCategory($pdo, $id, (int) $req->userId) === null) {
            Response::error('Category not found', 404);
            return;
        }

        $count = $pdo->prepare('SELECT COUNT(*) FROM tasks WHERE category_id = ? AND user_id = ?');
        $count->execute([$id, $req->userId]);
        $unlabelled = (int) $count->fetchColumn();

        $pdo->prepare('DELETE FROM task_categories WHERE id = ? AND user_id = ?')->execute([$id, $req->userId]);

        Response::json(['unlabelledTasks' => $unlabelled]);
    }

    // --- helpers ---

    /** Plain ownership lookup — also TasksController's assignment guard. */
    public static function findOwnedCategory(PDO $pdo, int $id, int $userId): ?array
    {
        $stmt = $pdo->prepare('SELECT * FROM task_categories WHERE id = ? AND user_id = ? LIMIT 1');
        $stmt->execute([$id, $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** Single-category version of the grouped count query, for create/patch responses. */
    private static function loadWithCounts(PDO $pdo, int $id, int $userId): ?array
    {
        $stmt = $pdo->prepare(
            'SELECT c.*,
                    COUNT(t.id) AS total_count,
                    SUM(CASE WHEN t.status <> \'done\' THEN 1 ELSE 0 END) AS remaining_count
             FROM task_categories c
             LEFT JOIN tasks t ON t.category_id = c.id AND t.user_id = c.user_id
             WHERE c.id = ? AND c.user_id = ?
             GROUP BY c.id',
        );
        $stmt->execute([$id, $userId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    private static function mapCategory(array $r): array
    {
        return [
            'id' => (int) $r['id'],
            'userId' => (int) $r['user_id'],
            'name' => $r['name'],
            'color' => (int) $r['color'],
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

    /** Palette index — shared with projects (#268), same bound. */
    private static function color(mixed $v): ?int
    {
        return is_int($v) && $v >= 0 && $v < ProjectsController::PALETTE_SIZE ? $v : null;
    }
}

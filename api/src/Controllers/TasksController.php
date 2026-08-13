<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Db;
use App\Http\Request;
use App\Http\Response;
use App\Notifications\Notifications;
use App\Points\Award;
use App\Points\PointsConfig;
use App\Projects\Lifecycle;
use App\Support\Timestamps;
use App\Tasks\Recur;
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
        // Conditions are t.-prefixed: the list query LEFT JOINs projects (#268)
        // for the row's project name + colour, and both tables share column names.
        $conditions = ['t.user_id = ?'];
        $args = [$req->userId];

        $status = $req->query('status');
        if ($status !== null) {
            if (!in_array($status, self::STATUS, true)) {
                Response::error('Invalid status filter', 400);
                return;
            }
            $conditions[] = 't.status = ?';
            $args[] = $status;
        }

        // Archived axis (#312; visibility revised #332, re-revised #406): the
        // per-project/category filters are the ONLY mixed views that still
        // include filed-away tasks (the Archived tab mixes everything, so
        // they're the sane place to find one list's filed task — sorted last,
        // see the ORDER BY below, pill rendered "Archived"). The Overview
        // (no-filter) view and the working lists (status tabs, Unassigned)
        // exclude them. `archived=1` flips to the archive-only view.
        $archived = $req->query('archived') === '1';
        $scoped = $req->query('projectId') !== null || $req->query('categoryId') !== null;
        if ($archived) {
            $conditions[] = 't.archived_at IS NOT NULL';
        } elseif (!$scoped || $status !== null || $req->query('unassigned') === '1') {
            $conditions[] = 't.archived_at IS NULL';
        }

        // Unassigned filter (#236): tasks with no project, across all statuses (a
        // different axis than the status tabs). Covered by the (user_id, project_id)
        // index from #234's migration 010.
        if ($req->query('unassigned') === '1') {
            $conditions[] = 't.project_id IS NULL';
        }

        // Recurring filter (2.3.0 review round): the rail's Recurring entry —
        // the LIVE occurrence of every recurring chain (rule-carrying, not yet
        // done, not filed). Done occurrences keep their rule columns after the
        // #250 spawn, so without the status guard every past occurrence would
        // pile up here.
        if ($req->query('recurring') === '1') {
            $conditions[] = '(t.recur_unit IS NOT NULL OR t.recur_day_of_month IS NOT NULL)';
            $conditions[] = "t.status <> 'done'";
            $conditions[] = 't.archived_at IS NULL';
        }

        // Per-project filter (#260, the backend half of #245): all of one owned
        // project's tasks, any status. Non-enumerating — a project that isn't the
        // caller's own 404s just like the rest of the Projects API (#129). Same
        // (user_id, project_id) index as the unassigned axis.
        $projectParam = $req->query('projectId');
        if ($projectParam !== null) {
            $projectId = self::positiveInt($projectParam);
            if ($projectId === null) {
                Response::error('Invalid project filter', 400);
                return;
            }
            if (ProjectsController::findOwnedProject(Db::pdo(), $projectId, (int) $req->userId) === null) {
                Response::error('Project not found', 404);
                return;
            }
            $conditions[] = 't.project_id = ?';
            $args[] = $projectId;
        }

        // Per-category filter (#276): the rail's custom-list entries — same
        // shape and non-enumeration rules as the project axis above.
        $categoryParam = $req->query('categoryId');
        if ($categoryParam !== null) {
            $categoryId = self::positiveInt($categoryParam);
            if ($categoryId === null) {
                Response::error('Invalid category filter', 400);
                return;
            }
            if (CategoriesController::findOwnedCategory(Db::pdo(), $categoryId, (int) $req->userId) === null) {
                Response::error('Category not found', 404);
                return;
            }
            $conditions[] = 't.category_id = ?';
            $args[] = $categoryId;
        }

        // The list ships each row's project name + colour (#268), its category
        // name + colour (#276), and, for done tasks, the points actually earned
        // (#256 review — points_log join; UNIQUE(task_id) keeps it 1:1) — no
        // N+1 any way round.
        $select = 'SELECT t.*, p.name AS project_name, p.color AS project_color,
                    c.name AS category_name, c.color AS category_color,
                    pl.total_points AS earned_points
             FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
             LEFT JOIN task_categories c ON c.id = t.category_id
             LEFT JOIN points_log pl ON pl.task_id = t.id';

        $paginated = $req->query('limit') !== null;
        if (!$paginated) {
            $stmt = Db::pdo()->prepare(
                $select . ' WHERE ' . implode(' AND ', $conditions) . ' ORDER BY t.id DESC',
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

        // OFFSET pagination (#262 — supersedes #100's keyset `before` cursor):
        // prev/next + an exact "X–Y of Z" need random access and a filtered
        // total; at personal-app scale the keyset advantage was moot. `offset`
        // is 0-based; absent = the first page.
        $offset = 0;
        if ($req->query('offset') !== null) {
            $parsed = self::nonNegativeInt($req->query('offset'));
            if ($parsed === null) {
                Response::error('Invalid offset', 400);
                return;
            }
            $offset = $parsed;
        }

        $pdo = Db::pdo();
        $where = ' WHERE ' . implode(' AND ', $conditions);

        // Filtered total for the range label ("X–Y of Z") + pager bounds.
        $count = $pdo->prepare('SELECT COUNT(*) FROM tasks t' . $where);
        $count->execute($args);
        $total = (int) $count->fetchColumn();

        // Paginated list order (#256 review): OLDEST FIRST by default (the queue
        // reads front-to-back like Play's age weighting); `order=desc` flips to
        // newest-first (the toolbar's sort toggle). The legacy unbounded list
        // above keeps its id DESC.
        $orderParam = $req->query('order');
        if ($orderParam !== null && $orderParam !== 'asc' && $orderParam !== 'desc') {
            Response::error('Invalid order', 400);
            return;
        }
        $order = $orderParam === 'desc' ? 'DESC' : 'ASC';
        // The archive orders by WHEN it was filed (#312 — newest-archived first
        // under the default desc), with id as a same-second tiebreak.
        $orderCol = $archived ? 't.archived_at' : 't.id';
        // #406: the per-project/category mixed views sort archived rows to the
        // BOTTOM — a leading group key ahead of the user's newest/oldest sort,
        // so the grouping survives offset pagination (the toggle applies
        // within each group).
        $groupKey = !$archived && $scoped ? '(t.archived_at IS NULL) DESC, ' : '';
        $stmt = $pdo->prepare(
            $select . $where . " ORDER BY {$groupKey}{$orderCol} {$order}, t.id {$order} LIMIT " . $limit . ' OFFSET ' . $offset,
        );
        $stmt->execute($args);

        Response::json([
            'tasks' => array_map([self::class, 'mapTask'], $stmt->fetchAll()),
            'total' => $total,
            // Global per-status counts (tab pills + the "ready to do" figure) ride
            // every paginated response — two small indexed queries.
            'counts' => self::statusCounts($pdo, $req->userId),
        ]);
    }

    /**
     * Per-status task counts for the dashboard tab bar (#100), plus `all` and
     * `unassigned` (#236 — `project_id IS NULL`, its own axis so it's a separate
     * count, not part of the status GROUP BY).
     */
    private static function statusCounts(PDO $pdo, int $userId): array
    {
        // Archived rows (#312) sit outside the STATUS figures — "Done" means
        // "done, not filed away" — but `all` includes them (#332: the All view
        // lists them), and they get their own count for the archive tab.
        $stmt = $pdo->prepare(
            'SELECT status, COUNT(*) AS c FROM tasks WHERE user_id = ? AND archived_at IS NULL GROUP BY status',
        );
        $stmt->execute([$userId]);
        $counts = ['all' => 0, 'backlog' => 0, 'in_progress' => 0, 'done' => 0];
        foreach ($stmt->fetchAll() as $row) {
            $n = (int) $row['c'];
            $counts[$row['status']] = $n;
            $counts['all'] += $n;
        }

        $u = $pdo->prepare(
            'SELECT COUNT(*) FROM tasks WHERE user_id = ? AND project_id IS NULL AND archived_at IS NULL',
        );
        $u->execute([$userId]);
        $counts['unassigned'] = (int) $u->fetchColumn();

        $a = $pdo->prepare('SELECT COUNT(*) FROM tasks WHERE user_id = ? AND archived_at IS NOT NULL');
        $a->execute([$userId]);
        $counts['archived'] = (int) $a->fetchColumn();
        // #406: `all` (the Overview figure) EXCLUDES archived — the Overview
        // view no longer shows filed tasks; the Archived tab has its own count.

        // Live recurring chains (2.3.0 review round) — mirrors the recurring=1
        // filter above, so the rail entry's count matches its list.
        $r = $pdo->prepare(
            "SELECT COUNT(*) FROM tasks WHERE user_id = ? AND (recur_unit IS NOT NULL OR recur_day_of_month IS NOT NULL) AND status <> 'done' AND archived_at IS NULL",
        );
        $r->execute([$userId]);
        $counts['recurring'] = (int) $r->fetchColumn();

        return $counts;
    }

    /** GET /api/tasks/next?size=small|big&minutes=15&exclude=42&mode=projects&category=3 */
    public function next(Request $req, array $params): void
    {
        $mode = $req->query('mode');
        if ($mode !== null && $mode !== 'projects') {
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

        // Category filter (#276): scope the pick to one owned custom list. An
        // independent axis, so it composes with win-type/time AND projects mode.
        $category = null;
        if ($req->query('category') !== null) {
            $category = self::positiveInt($req->query('category'));
            if ($category === null) {
                Response::error('Invalid filters', 400);
                return;
            }
            if (CategoriesController::findOwnedCategory(Db::pdo(), $category, (int) $req->userId) === null) {
                Response::error('Category not found', 404);
                return;
            }
        }

        // "Focus on projects" (#238): win-type is ignored; pick the oldest task of
        // the active project closest to done, respecting the time filter.
        if ($mode === 'projects') {
            $this->nextInProjects($req, $minutes, $exclude, $category);
            return;
        }

        $size = $req->query('size');
        if ($size !== null && !isset(self::WIN_TYPE_COMPLEXITY[$size])) {
            Response::error('Invalid filters', 400);
            return;
        }

        // Availability cutoff (#250): future-dated ("snoozed") tasks are never
        // suggested — also the anti-farming guard for daily recurring tasks.
        $conditions = ['user_id = ?', "status = 'backlog'", '(available_from IS NULL OR available_from <= ?)'];
        $args = [$req->userId, self::todayInTz()];
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
        if ($category !== null) {
            $conditions[] = 'category_id = ?';
            $args[] = $category;
        }

        $stmt = Db::pdo()->prepare('SELECT * FROM tasks WHERE ' . implode(' AND ', $conditions));
        $stmt->execute($args);
        $candidates = array_map([self::class, 'mapTask'], $stmt->fetchAll());
        Response::json(['task' => Selection::pick($candidates, self::userStrategy((int) $req->userId))]);
    }

    /**
     * GET /api/tasks/availability (#306): can each Play Choice option produce a
     * task at ANY time? One grouped pass over the caller's backlog: per-
     * complexity counts (the win-type pools reuse WIN_TYPE_COMPLEXITY, so the
     * client never re-encodes the mapping) + whether any backlog task sits in
     * an ACTIVE project (project existence alone isn't enough). The time filter
     * is deliberately NOT part of this — "nothing matched your time" stays the
     * empty state's job.
     */
    public function availability(Request $req, array $params): void
    {
        $stmt = Db::pdo()->prepare(
            "SELECT t.complexity, COUNT(*) AS c,
                    SUM(CASE WHEN p.id IS NOT NULL THEN 1 ELSE 0 END) AS in_active_project
             FROM tasks t
             LEFT JOIN projects p ON p.id = t.project_id AND p.user_id = t.user_id AND p.status = 'active'
             WHERE t.user_id = ? AND t.status = 'backlog'
               AND (t.available_from IS NULL OR t.available_from <= ?)
             GROUP BY t.complexity",
        );
        $stmt->execute([$req->userId, self::todayInTz()]);

        $byComplexity = ['low' => 0, 'medium' => 0, 'high' => 0];
        $inProjects = 0;
        foreach ($stmt->fetchAll() as $row) {
            $byComplexity[$row['complexity']] = (int) $row['c'];
            $inProjects += (int) $row['in_active_project'];
        }
        $hasAny = static fn (array $pool): bool =>
            array_sum(array_map(static fn (string $c): int => $byComplexity[$c], $pool)) > 0;

        Response::json([
            'small' => $hasAny(self::WIN_TYPE_COMPLEXITY['small']),
            'big' => $hasAny(self::WIN_TYPE_COMPLEXITY['big']),
            'projects' => $inProjects > 0,
        ]);
    }

    /** The user's stored Play selection strategy (#266); defaults server-side. */
    private static function userStrategy(int $userId): string
    {
        $stmt = Db::pdo()->prepare('SELECT selection_strategy FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);
        $v = $stmt->fetchColumn();
        return is_string($v) && $v !== '' ? $v : 'weightedByAge';
    }

    /**
     * "Focus on projects" pick (#238): backlog tasks in an ACTIVE project the user
     * owns (join enforces both), optionally time-filtered, joined with the project's
     * created_at for the tie-break. The least-effort-project / oldest-task logic
     * lives in Selection::focusProject (deterministic, swappable). Same `{ task }`
     * shape as the default mode, so TaskPresented → InProgress is unchanged.
     */
    private function nextInProjects(Request $req, ?int $minutes, ?int $exclude, ?int $category = null): void
    {
        // Same availability cutoff as the default mode (#250).
        $conditions = ['t.user_id = ?', "t.status = 'backlog'", '(t.available_from IS NULL OR t.available_from <= ?)'];
        $args = [$req->userId, self::todayInTz()];
        if ($minutes !== null) {
            $conditions[] = 't.estimated_minutes <= ?';
            $args[] = $minutes;
        }
        if ($exclude !== null) {
            $conditions[] = 't.id <> ?';
            $args[] = $exclude;
        }
        if ($category !== null) {
            $conditions[] = 't.category_id = ?';
            $args[] = $category;
        }

        $stmt = Db::pdo()->prepare(
            'SELECT t.*, p.created_at AS project_created_at
             FROM tasks t
             JOIN projects p ON p.id = t.project_id AND p.user_id = t.user_id AND p.status = \'active\'
             WHERE ' . implode(' AND ', $conditions),
        );
        $stmt->execute($args);

        $chosen = Selection::focusProject($stmt->fetchAll(), PointsConfig::BASE_POINTS);
        Response::json(['task' => $chosen !== null ? self::mapTask($chosen) : null]);
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

        // Optional project (#234, widened #310): a task may be created directly
        // into ANY project the caller owns — a done/archived target reactivates
        // (Lifecycle below). Bad shape or a foreign id → 400.
        $projectId = null;
        if (array_key_exists('projectId', $req->body)) {
            $projectId = self::positiveIntValue($req->input('projectId'));
            if ($req->input('projectId') !== null && $projectId === null) {
                Response::error('Invalid input', 400);
                return;
            }
        }

        // Optional category (#276) — must be a category the caller owns.
        $categoryId = null;
        if (array_key_exists('categoryId', $req->body)) {
            $categoryId = self::positiveIntValue($req->input('categoryId'));
            if ($req->input('categoryId') !== null && $categoryId === null) {
                Response::error('Invalid input', 400);
                return;
            }
        }

        // Snooze date + recurrence rule (#250) — both optional at creation.
        $availableFrom = null;
        if (array_key_exists('availableFrom', $req->body)) {
            $availableFrom = self::availableFrom($req->input('availableFrom'));
            if ($availableFrom === false) {
                Response::error('Invalid input', 400);
                return;
            }
        }
        $recur = ['recur_unit' => null, 'recur_interval' => null, 'recur_day_of_month' => null];
        if (array_key_exists('recurrence', $req->body)) {
            $parsed = self::recurrence($req->input('recurrence'));
            if ($parsed === false) {
                Response::error('Invalid input', 400);
                return;
            }
            if ($parsed !== null) {
                $recur = $parsed;
            }
        }

        $pdo = Db::pdo();
        if ($projectId !== null && ProjectsController::findOwnedProject($pdo, $projectId, (int) $req->userId) === null) {
            Response::error('Invalid input', 400);
            return;
        }
        if ($categoryId !== null && CategoriesController::findOwnedCategory($pdo, $categoryId, (int) $req->userId) === null) {
            Response::error('Invalid input', 400);
            return;
        }
        $pdo->prepare('INSERT INTO tasks (user_id, title, description, complexity, estimated_minutes, project_id, category_id, available_from, recur_unit, recur_interval, recur_day_of_month) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([$req->userId, $title, $description, $complexity, $minutes, $projectId, $categoryId, $availableFrom, $recur['recur_unit'], $recur['recur_interval'], $recur['recur_day_of_month']]);
        $taskId = (int) $pdo->lastInsertId(); // before Lifecycle's writes clobber it

        // #310: assignment reactivates an archived target, and the new
        // (unfinished) task reverts a done project to active.
        if ($projectId !== null) {
            Lifecycle::reactivate($projectId, (int) $req->userId);
            Lifecycle::sync($projectId, (int) $req->userId);
        }

        $created = self::findOwned($pdo, $taskId, (int) $req->userId);
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

        // Assign / clear a category (#276): same null-vs-absent semantics as
        // projectId — `false` = key absent, null = "unlabel", int = assign.
        $assignCategory = false;
        if (array_key_exists('categoryId', $req->body)) {
            $raw = $req->input('categoryId');
            if ($raw === null) {
                $assignCategory = null;
            } else {
                $assignCategory = self::positiveIntValue($raw);
                if ($assignCategory === null) {
                    Response::error('Invalid input', 400);
                    return;
                }
            }
            $sets[] = 'category_id = ?';
            $args[] = $assignCategory;
        }

        // Snooze until (#250): null clears, a date sets. Same absent-vs-null
        // discipline as projectId (absent = untouched).
        if (array_key_exists('availableFrom', $req->body)) {
            $availableFrom = self::availableFrom($req->input('availableFrom'));
            if ($availableFrom === false) {
                Response::error('Invalid input', 400);
                return;
            }
            $sets[] = 'available_from = ?';
            $args[] = $availableFrom;
        }

        // Recurrence rule (#250): null clears all three columns ("stop
        // recurring"); an object swaps the rule (families mutually exclusive).
        if (array_key_exists('recurrence', $req->body)) {
            $recur = self::recurrence($req->input('recurrence'));
            if ($recur === false) {
                Response::error('Invalid input', 400);
                return;
            }
            $recur ??= ['recur_unit' => null, 'recur_interval' => null, 'recur_day_of_month' => null];
            foreach ($recur as $col => $val) {
                $sets[] = "{$col} = ?";
                $args[] = $val;
            }
        }

        $newStatus = null;
        if (array_key_exists('status', $req->body)) {
            $newStatus = self::enum($req->input('status'), self::STATUS);
            if ($newStatus === null) {
                Response::error('Invalid input', 400);
                return;
            }
        }

        // Archive / unarchive (#312): a boolean AXIS flag beside status. Only a
        // done task can be archived (done → archive, matching the project flow);
        // the done-check runs below once the existing row is in hand.
        $archivedFlag = null;
        if (array_key_exists('archived', $req->body)) {
            $rawArchived = $req->input('archived');
            if (!is_bool($rawArchived)) {
                Response::error('Invalid input', 400);
                return;
            }
            $archivedFlag = $rawArchived;
        }

        if (count($sets) === 0 && $newStatus === null && $archivedFlag === null) {
            Response::error('No fields to update', 400);
            return;
        }

        $pdo = Db::pdo();
        $existing = self::findOwned($pdo, $id, (int) $req->userId);
        if ($existing === null) {
            Response::error('Task not found', 404);
            return;
        }

        // A non-null project assignment must reference a project the caller owns
        // (a foreign id → 400, not a silent write). Any status is assignable
        // (#310) — a done/archived target reactivates after the write below.
        if (is_int($assign) && ProjectsController::findOwnedProject($pdo, $assign, (int) $req->userId) === null) {
            Response::error('Invalid input', 400);
            return;
        }
        if (is_int($assignCategory) && CategoriesController::findOwnedCategory($pdo, $assignCategory, (int) $req->userId) === null) {
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
                    // #383: the speed bonus is a one-shot sprint reward — an
                    // in-progress task sent back to Ready forfeits it for good
                    // (sticky; re-arming the timer can never help).
                    if ($existing['status'] === 'in_progress') {
                        $sets[] = 'bonus_forfeited = 1';
                    }
                }
                // Leaving 'done' un-files the task (#312) — the archived ⇒ done
                // invariant keeps archived rows out of the Play backlog pool.
                if ($newStatus !== 'done') {
                    $sets[] = 'archived_at = NULL';
                }
            }
        }

        if ($archivedFlag === true) {
            if (($newStatus ?? $existing['status']) !== 'done') {
                Response::error('Only done tasks can be archived', 400);
                return;
            }
            // IFNULL keeps the original filing time on a redundant re-archive.
            $sets[] = 'archived_at = IFNULL(archived_at, NOW())';
        } elseif ($archivedFlag === false) {
            $sets[] = 'archived_at = NULL';
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

        // #310: an explicit assignment reactivates an archived target BEFORE the
        // award below, so completing a task straight into it can still pay the
        // #240 bonus (which requires an active project).
        if (is_int($assign)) {
            Lifecycle::reactivate($assign, (int) $req->userId);
        }

        // #403: any status transition ends the task's current RUN — its
        // overrun-family notifications (warn/returned) belong to that run:
        // a manual send-back makes the warn stale, and a restart must re-arm
        // the per-run dedupe. (Completion deletes everything just below.)
        if ($newStatus !== null && $newStatus !== $existing['status'] && !$completing) {
            Notifications::removeOverrunForTask($pdo, (int) $updated['id'], (int) $req->userId);
        }

        $pointsAwarded = null;
        $projectCompleted = null;
        if ($completing) {
            // A completed task's notifications are moot (#366) — remove them.
            // (Task deletion needs no hook: the notifications FK cascades.)
            Notifications::removeForTask($pdo, (int) $updated['id'], (int) $req->userId);
            // #383: the award reads timing + the forfeit flag off the reloaded
            // row and may zero itself (reason rides the response for the UI).
            $pointsAwarded = Award::awardTaskCompletion($updated);
            // Completing this task may have finished its project (#240) — the award
            // self-guards (fires only when the project is now fully done, once ever).
            // #391 review: a completion the #383 regulation ZEROED must not mint the
            // bonus either (project churn would leak points past the daily limits).
            // A re-complete (award null, no reason) still checks — that's also the
            // recovery path: reopen + complete the last task on a fresh day and the
            // once-ever bonus pays then.
            $zeroed = $pointsAwarded !== null && isset($pointsAwarded['reason']);
            if ($updated['project_id'] !== null && !$zeroed) {
                $projectCompleted = Award::awardProjectCompletion(
                    (int) $updated['project_id'],
                    (int) $updated['user_id'],
                );
            }
        }

        // Clone-per-occurrence (#250): completing a recurring task spawns ONE
        // fresh backlog occurrence dated to the next recurrence. Gated on the
        // points award actually winning — its UNIQUE(task_id) makes exactly one
        // caller the winner under a concurrent double-complete (the #74
        // pattern), and a reopened-then-recompleted task (award null) never
        // spawns a duplicate of the clone it already produced.
        $recursAt = null;
        if ($completing && $pointsAwarded !== null && Recur::isRecurring($updated)) {
            $recursAt = Recur::nextOccurrence($updated, self::todayInTz());
            if ($recursAt !== null) {
                $pdo->prepare(
                    'INSERT INTO tasks (user_id, title, description, complexity, estimated_minutes,
                                        project_id, category_id, available_from,
                                        recur_unit, recur_interval, recur_day_of_month)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                )->execute([
                    $updated['user_id'],
                    $updated['title'],
                    $updated['description'],
                    $updated['complexity'],
                    $updated['estimated_minutes'],
                    $updated['project_id'],
                    $updated['category_id'],
                    $recursAt,
                    $updated['recur_unit'],
                    $updated['recur_interval'],
                    $updated['recur_day_of_month'],
                ]);
            }
        }

        // #310: settle 'done' ⇄ 'active' for every project this PATCH touched —
        // the one the task left (unassign/reassign may complete it) and the one
        // it's in now (complete → done; reopen/new unfinished task → active).
        // After the award on purpose: awardProjectCompletion requires 'active'.
        $touched = array_unique(array_filter([
            $existing['project_id'] !== null ? (int) $existing['project_id'] : null,
            $updated['project_id'] !== null ? (int) $updated['project_id'] : null,
        ]));
        foreach ($touched as $projectId) {
            Lifecycle::sync($projectId, (int) $req->userId);
        }

        $body = ['task' => self::mapTask($updated)];
        if ($pointsAwarded !== null) {
            $body['pointsAwarded'] = $pointsAwarded;
        }
        if ($projectCompleted !== null) {
            $body['projectCompleted'] = $projectCompleted;
        }
        // The completing call reports when the spawned occurrence comes back
        // (#250) — same rider pattern as projectCompleted.
        if ($recursAt !== null) {
            $body['recursAt'] = $recursAt;
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
        $existing = self::findOwned($pdo, $id, (int) $req->userId);
        if ($existing === null) {
            Response::error('Task not found', 404);
            return;
        }
        $pdo->prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?')->execute([$id, $req->userId]);
        // #310: removing the last unfinished task can complete its project.
        if ($existing['project_id'] !== null) {
            Lifecycle::sync((int) $existing['project_id'], (int) $req->userId);
        }
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
            'categoryId' => ($r['category_id'] ?? null) !== null ? (int) $r['category_id'] : null,
            'startedAt' => Timestamps::iso($r['started_at']),
            'completedAt' => Timestamps::iso($r['completed_at']),
            'actualMinutes' => $r['actual_minutes'] !== null ? (int) $r['actual_minutes'] : null,
            // Archived axis (#312); coalesced for narrow pre-migration SELECTs.
            'archivedAt' => Timestamps::iso($r['archived_at'] ?? null),
            // Scheduled availability + recurrence rule (#250). available_from is
            // a plain DATE (no time component), so it ships as-is, not ISO-time.
            'availableFrom' => $r['available_from'] ?? null,
            'recurrence' => ($r['recur_day_of_month'] ?? null) !== null
                ? ['dayOfMonth' => (int) $r['recur_day_of_month']]
                : (($r['recur_unit'] ?? null) !== null
                    ? ['unit' => $r['recur_unit'], 'interval' => (int) $r['recur_interval']]
                    : null),
            'createdAt' => Timestamps::iso($r['created_at']),
            'updatedAt' => Timestamps::iso($r['updated_at']),
            // Joined project name + colour (#268) — present only on the list
            // query (the LEFT JOIN); single-task responses omit the key.
            ...(array_key_exists('project_name', $r)
                ? [
                    'project' => $r['project_name'] !== null
                        ? ['name' => $r['project_name'], 'color' => (int) $r['project_color']]
                        : null,
                ]
                : []),
            // Joined category name + colour (#276) — list only, like project.
            ...(array_key_exists('category_name', $r)
                ? [
                    'category' => $r['category_name'] !== null
                        ? ['name' => $r['category_name'], 'color' => (int) $r['category_color']]
                        : null,
                ]
                : []),
            // Points actually earned (#256 review) — list only, null until done.
            ...(array_key_exists('earned_points', $r)
                ? ['earnedPoints' => $r['earned_points'] !== null ? (int) $r['earned_points'] : null]
                : []),
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

    /** A non-negative int query param (`offset`, #262); null = invalid. */
    private static function nonNegativeInt(?string $raw): ?int
    {
        return $raw !== null && ctype_digit($raw) ? (int) $raw : null;
    }

    /** A positive int from a typed JSON body value (projectId); null otherwise. */
    private static function positiveIntValue(mixed $v): ?int
    {
        return is_int($v) && $v > 0 ? $v : null;
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

    /** Today's calendar date (Y-m-d) in APP_TIMEZONE — the availability cutoff (#250). */
    private static function todayInTz(): string
    {
        return (new \DateTimeImmutable('now', new \DateTimeZone(PointsConfig::timezone())))->format('Y-m-d');
    }

    /**
     * Optional availableFrom (#250): null (clear/absent) | 'Y-m-d' (valid) |
     * false (present but invalid). A real calendar date is required — the
     * round-trip check rejects 2026-02-31-style overflow.
     */
    private static function availableFrom(mixed $v): string|false|null
    {
        if ($v === null) {
            return null;
        }
        if (!is_string($v) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) {
            return false;
        }
        $d = \DateTimeImmutable::createFromFormat('Y-m-d', $v, new \DateTimeZone('UTC'));
        return $d !== false && $d->format('Y-m-d') === $v ? $v : false;
    }

    /**
     * Optional recurrence object (#250): null (clear/absent) | array of the
     * three column values (valid) | false (invalid). The two families are
     * mutually exclusive: { unit, interval } XOR { dayOfMonth }.
     *
     * @return array{recur_unit:?string,recur_interval:?int,recur_day_of_month:?int}|false|null
     */
    private static function recurrence(mixed $v): array|false|null
    {
        if ($v === null) {
            return null;
        }
        if (!is_array($v)) {
            return false;
        }
        $hasInterval = array_key_exists('unit', $v) || array_key_exists('interval', $v);
        $hasDay = array_key_exists('dayOfMonth', $v);
        if ($hasInterval === $hasDay) { // both families, or an empty object
            return false;
        }
        if ($hasDay) {
            $day = $v['dayOfMonth'];
            if (!is_int($day) || $day < 1 || $day > 31 || count($v) !== 1) {
                return false;
            }
            return ['recur_unit' => null, 'recur_interval' => null, 'recur_day_of_month' => $day];
        }
        $unit = $v['unit'] ?? null;
        $interval = $v['interval'] ?? null;
        if (self::enum($unit, ['day', 'week', 'month']) === null || !is_int($interval) || $interval < 1 || $interval > 365 || count($v) !== 2) {
            return false;
        }
        return ['recur_unit' => $unit, 'recur_interval' => $interval, 'recur_day_of_month' => null];
    }
}

<?php

declare(strict_types=1);

namespace App\Projects;

use App\Db;

/**
 * Automatic project lifecycle (#310): 'done' ⇄ 'active' mirrors the tasks —
 * a project with ≥1 task and none unfinished is 'done'; gaining an unfinished
 * task (added, reopened, or assigned) reverts it. The same self-guarding
 * all-done check as the #240 bonus, but independent of its once-ever guard, so
 * re-completing a reopened project re-marks it done without re-paying.
 *
 * 'archived' stays a MANUAL state: sync() never touches it. Reactivation out
 * of 'archived' happens only on an explicit assignment (reactivate()).
 */
final class Lifecycle
{
    /**
     * Recompute 'done' ⇄ 'active' for a project from its task tallies. No-op
     * for archived projects and when the status already matches. Call after
     * any task mutation that can change the tallies (complete, reopen, create
     * into, assign/unassign, delete).
     */
    public static function sync(int $projectId, int $userId): void
    {
        $pdo = Db::pdo();
        $stmt = $pdo->prepare(
            "SELECT COUNT(*) AS total, COALESCE(SUM(status = 'done'), 0) AS done_c
             FROM tasks WHERE project_id = ? AND user_id = ?",
        );
        $stmt->execute([$projectId, $userId]);
        $row = $stmt->fetch();
        $total = (int) $row['total'];
        $allDone = $total > 0 && (int) $row['done_c'] === $total;

        // Guarded flip: only ever moves between 'active' and 'done', so an
        // archived project (or a concurrent identical state) is left alone.
        $pdo->prepare('UPDATE projects SET status = ? WHERE id = ? AND user_id = ? AND status = ?')
            ->execute([
                $allDone ? 'done' : 'active',
                $projectId,
                $userId,
                $allDone ? 'active' : 'done',
            ]);
    }

    /**
     * Assigning a task to an ARCHIVED project reactivates it (#310 §2) —
     * archived → active; follow with sync() so a fully-done project settles on
     * 'done' rather than lingering active.
     */
    public static function reactivate(int $projectId, int $userId): void
    {
        Db::pdo()
            ->prepare("UPDATE projects SET status = 'active' WHERE id = ? AND user_id = ? AND status = 'archived'")
            ->execute([$projectId, $userId]);
    }
}

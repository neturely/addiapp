<?php

declare(strict_types=1);

/**
 * Migration runner (decision #2 of the PHP rewrite). Applies migrations/*.sql in
 * filename order, tracking applied files by name in `_migrations`; an
 * already-recorded file is skipped, so re-running after a *fully* applied deploy
 * is a no-op.
 *
 * A file is recorded only after ALL its statements succeed, and DDL auto-commits
 * (no wrapping transaction is possible), so a file that dies mid-way is left
 * PARTIALLY APPLIED and NOT recorded — a plain re-run then restarts it from the
 * top and can fail on the statements that already landed. To keep re-runs safe:
 *   - Prefer ONE logical change (ideally one statement) per migration file, so a
 *     failure can't leave a file half-applied (OPS-2, #103).
 *   - Use idempotent DDL (`CREATE TABLE/INDEX IF NOT EXISTS`,
 *     `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) where MariaDB supports it.
 * On failure the runner prints which statement index failed and whether the file
 * is partially applied, so recovery isn't guesswork. Usage: `php migrate.php`.
 */

require __DIR__ . '/src/autoload.php';

use App\Db;

$pdo = Db::pdo();
$pdo->exec(
    'CREATE TABLE IF NOT EXISTS `_migrations` (' .
    '`name` varchar(191) NOT NULL, ' .
    '`applied_at` timestamp NOT NULL DEFAULT (now()), ' .
    'PRIMARY KEY (`name`))',
);

$done = $pdo->query('SELECT name FROM `_migrations`')->fetchAll(\PDO::FETCH_COLUMN);
$done = array_flip($done);

$files = glob(__DIR__ . '/migrations/*.sql') ?: [];
sort($files);

$applied = 0;
foreach ($files as $file) {
    $name = basename($file);
    if (isset($done[$name])) {
        continue;
    }

    $sql = (string) file_get_contents($file);
    // Strip full-line `--` comments, then split into statements on `;`.
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    $statements = array_values(
        array_filter(array_map('trim', explode(';', (string) $sql)), static fn ($s) => $s !== ''),
    );

    // No transaction: MySQL/MariaDB DDL implicitly commits, so a transaction can't
    // wrap it. Statements are applied in order; on failure we stop and report where.
    $i = 0;
    try {
        foreach ($statements as $i => $stmt) {
            $pdo->exec($stmt);
        }
        $pdo->prepare('INSERT INTO `_migrations` (`name`) VALUES (?)')->execute([$name]);
    } catch (\Throwable $e) {
        $total = count($statements);
        fwrite(STDERR, "[addiapp] migration failed: {$name} (statement " . ($i + 1) . " of {$total})\n{$e->getMessage()}\n");
        fwrite(STDERR, $i > 0
            ? "[addiapp] WARNING: {$name} is PARTIALLY APPLIED — statements 1-{$i} already ran but the file is not recorded in `_migrations`. Make the earlier statements idempotent (IF NOT EXISTS) or reconcile by hand before re-running.\n"
            : "[addiapp] No statements from {$name} were applied.\n");
        exit(1);
    }

    echo "[addiapp] applied {$name}\n";
    $applied++;
}

echo $applied > 0 ? "[addiapp] migrations applied ({$applied})\n" : "[addiapp] up to date\n";

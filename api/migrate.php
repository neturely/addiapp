<?php

declare(strict_types=1);

/**
 * Migration runner (decision #2 of the PHP rewrite). Applies migrations/*.sql in
 * filename order, tracking applied files in `_migrations`. Idempotent — re-runs
 * are a no-op. Usage: `php migrate.php`.
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
    $statements = array_filter(array_map('trim', explode(';', (string) $sql)), static fn ($s) => $s !== '');

    // No transaction: MySQL DDL implicitly commits, so a transaction can't wrap
    // it. Statements are applied in order; on failure we stop (re-run/reset).
    try {
        foreach ($statements as $stmt) {
            $pdo->exec($stmt);
        }
        $pdo->prepare('INSERT INTO `_migrations` (`name`) VALUES (?)')->execute([$name]);
    } catch (\Throwable $e) {
        fwrite(STDERR, "[addiapp] migration failed: {$name}\n{$e->getMessage()}\n");
        exit(1);
    }

    echo "[addiapp] applied {$name}\n";
    $applied++;
}

echo $applied > 0 ? "[addiapp] migrations applied ({$applied})\n" : "[addiapp] up to date\n";

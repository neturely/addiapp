<?php

declare(strict_types=1);

/**
 * PHPUnit bootstrap. Wires two autoloaders:
 *   - Composer's (PHPUnit itself + the Tests\ PSR-4 namespace), and
 *   - the app's own dependency-free autoloader (App\ -> api/src), so the tests
 *     exercise the SAME loader production uses — no Composer inside api/.
 *
 * DB-backed tests read DATABASE_URL from the environment (Config honours it).
 * Point it at a throwaway `addiapp_test` schema; never at dev/prod data.
 */

require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/../api/src/autoload.php';

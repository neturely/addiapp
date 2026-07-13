<?php

declare(strict_types=1);

/**
 * Tiny PSR-4-style autoloader: App\Foo\Bar → api/src/Foo/Bar.php. No Composer
 * needed — the backend is deliberately dependency-free.
 */
spl_autoload_register(static function (string $class): void {
    $prefix = 'App\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }
    $relative = substr($class, strlen($prefix));
    $path = __DIR__ . '/' . str_replace('\\', '/', $relative) . '.php';
    if (is_file($path)) {
        require $path;
    }
});

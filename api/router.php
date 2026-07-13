<?php

declare(strict_types=1);

/**
 * Router script for the PHP built-in server (local dev):
 *   php -S localhost:3001 api/router.php
 * Serves real static files under public/, hands everything else to the front
 * controller — mirroring the .htaccess rewrite.
 */
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$file = __DIR__ . '/public' . $path;

if ($path !== '/' && is_file($file)) {
    return false; // let the built-in server serve the asset
}

require __DIR__ . '/public/index.php';

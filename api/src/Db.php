<?php

declare(strict_types=1);

namespace App;

use PDO;

/** Lazy PDO connection (singleton) built from the `databaseUrl` config. */
final class Db
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo instanceof PDO) {
            return self::$pdo;
        }

        $url = (string) Config::get('databaseUrl');
        $p = parse_url($url);
        if ($p === false || !isset($p['host'])) {
            throw new \RuntimeException('Invalid databaseUrl');
        }

        // PHP PDO treats host=localhost as a UNIX socket. Local dev (docker MySQL
        // on TCP, with a port) needs 127.0.0.1; production cPanel uses localhost +
        // no port → its socket, which is left as-is.
        $host = $p['host'];
        $port = $p['port'] ?? null;
        if ($host === 'localhost' && $port !== null) {
            $host = '127.0.0.1';
        }

        $dsn = 'mysql:host=' . $host
            . ($port !== null ? ';port=' . $port : '')
            . ';dbname=' . ltrim($p['path'] ?? '', '/')
            . ';charset=utf8mb4';

        $pdo = new PDO(
            $dsn,
            isset($p['user']) ? rawurldecode($p['user']) : '',
            isset($p['pass']) ? rawurldecode($p['pass']) : '',
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ],
        );
        // All timestamps/NOW() in UTC (matches how the Node backend stored them),
        // so session/token expiry comparisons via SQL NOW() are TZ-safe.
        $pdo->exec("SET time_zone = '+00:00'");

        return self::$pdo = $pdo;
    }
}

<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Db;
use App\Http\Request;
use App\Http\Response;
use App\Log;
use App\Support\Timestamps;

final class HealthController
{
    public function index(Request $req, array $params): void
    {
        // Never let Cloudflare serve a cached 200 while the DB is down (OPS-3).
        if (!headers_sent()) {
            header('Cache-Control: no-store');
        }

        $dbOk = $this->checkDb();

        Response::json([
            'status' => $dbOk ? 'ok' : 'error',
            'service' => 'addiapp-api',
            'timestamp' => Timestamps::nowIso(),
            'checks' => ['db' => $dbOk ? 'ok' : 'down'],
        ], $dbOk ? 200 : 503);
    }

    /**
     * One `SELECT 1` proves the realistic outage modes together: MySQL up,
     * socket/network reachable, credentials valid, target DB selectable (the DSN
     * already selects the schema). Deliberately NOT a migration/schema check —
     * that's a deploy-time concern, not liveness. On failure we log one line and
     * return false; the caller answers 503 with a generic body (no detail leak).
     */
    private function checkDb(): bool
    {
        try {
            Db::pdo()->query('SELECT 1');
            return true;
        } catch (\Throwable $e) {
            Log::error('health db check failed', ['error' => $e->getMessage()]);
            return false;
        }
    }
}

<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Http\Request;
use App\Http\Response;
use App\Support\Timestamps;

final class HealthController
{
    public function index(Request $req, array $params): void
    {
        Response::json([
            'status' => 'ok',
            'service' => 'addiapp-api',
            'timestamp' => Timestamps::nowIso(),
        ]);
    }
}

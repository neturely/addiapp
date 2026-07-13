<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Http\Request;
use App\Http\Response;
use App\Points\Award;

final class PointsController
{
    /** GET /api/points — lean summary for the dashboard card. */
    public function index(Request $req, array $params): void
    {
        Response::json(Award::getPointsStats((int) $req->userId));
    }

    /** GET /api/points/stats — richer lifetime stats for the user page. */
    public function stats(Request $req, array $params): void
    {
        Response::json(Award::getUserStats((int) $req->userId));
    }
}

<?php

declare(strict_types=1);

require dirname(__DIR__) . '/src/autoload.php';

use App\Config;
use App\Controllers\AccountController;
use App\Controllers\AuthController;
use App\Controllers\HealthController;
use App\Controllers\PointsController;
use App\Controllers\TasksController;
use App\Http\Request;
use App\Http\Router;
use App\Log;

// Uncaught errors → JSON 500 (details logged, never leaked). Mirrors the Express
// fallback error handler.
set_exception_handler(static function (\Throwable $e): void {
    Log::error('unhandled error', ['exception' => (string) $e]);
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json');
    }
    echo json_encode(['error' => 'Internal server error']);
});

date_default_timezone_set('UTC');

// Security response headers (SEC-1, #107). Set here — before routing and the
// OPTIONS short-circuit — so every response carries them: the preflight 204, all
// routes, and the exception-handler 500. Origin-level defense-in-depth alongside
// the SPA .htaccess; Cloudflare is a second layer, not the only one. Apex-only
// HSTS (no includeSubDomains/preload — see docs/DEPLOY.md). frame-ancestors-only
// CSP is non-disruptive (the JSON API is never iframed).
header('Strict-Transport-Security: max-age=15552000');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: frame-ancestors 'none'");
header('Referrer-Policy: strict-origin-when-cross-origin');

// CORS: in dev the Vite proxy makes /api same-origin; in prod the SPA is served
// from the same host. Because responses carry the session cookie
// (Access-Control-Allow-Credentials: true), the allowed origin must be an exact
// allowlist — never a reflected arbitrary origin — so cross-site JS can't read
// authenticated responses. The only trusted origin is the configured SPA base.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = array_filter([rtrim((string) Config::get('appUrl'), '/')]);
if ($origin !== '' && in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    return;
}

$router = new Router();
$health = new HealthController();
$auth = new AuthController();
$tasks = new TasksController();
$points = new PointsController();
$account = new AccountController();

$router->get('/api/health', [$health, 'index']);

$router->post('/api/auth/register', [$auth, 'register']);
$router->post('/api/auth/login', [$auth, 'login']);
$router->post('/api/auth/verify', [$auth, 'verify']);
$router->post('/api/auth/resend-verification', [$auth, 'resendVerification']);
$router->post('/api/auth/forgot-password', [$auth, 'forgotPassword']);
$router->post('/api/auth/reset-password', [$auth, 'resetPassword']);
$router->post('/api/auth/logout', [$auth, 'logout']);
$router->get('/api/auth/me', [$auth, 'me'], true);

// Tasks — all require auth. `/next` is registered before `/{id}` so it wins.
$router->get('/api/tasks', [$tasks, 'index'], true);
$router->get('/api/tasks/next', [$tasks, 'next'], true);
$router->post('/api/tasks', [$tasks, 'create'], true);
$router->get('/api/tasks/{id}', [$tasks, 'show'], true);
$router->patch('/api/tasks/{id}', [$tasks, 'update'], true);
$router->delete('/api/tasks/{id}', [$tasks, 'destroy'], true);

$router->get('/api/points', [$points, 'index'], true);
$router->get('/api/points/stats', [$points, 'stats'], true);

// Account settings (#187) — all require auth.
$router->patch('/api/account', [$account, 'update'], true);
$router->post('/api/account/password', [$account, 'changePassword'], true);

$router->dispatch(Request::fromGlobals());

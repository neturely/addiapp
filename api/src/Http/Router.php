<?php

declare(strict_types=1);

namespace App\Http;

use App\Auth\Sessions;

/**
 * Minimal Express-style router: `{param}` path segments, per-route auth gate.
 * Routes are matched in registration order (register `/tasks/next` before
 * `/tasks/{id}`), first match wins.
 */
final class Router
{
    /** @var list<array{method:string,regex:string,names:list<string>,handler:callable,auth:bool}> */
    private array $routes = [];

    public function get(string $path, callable $handler, bool $auth = false): void
    {
        $this->add('GET', $path, $handler, $auth);
    }

    public function post(string $path, callable $handler, bool $auth = false): void
    {
        $this->add('POST', $path, $handler, $auth);
    }

    public function patch(string $path, callable $handler, bool $auth = false): void
    {
        $this->add('PATCH', $path, $handler, $auth);
    }

    public function delete(string $path, callable $handler, bool $auth = false): void
    {
        $this->add('DELETE', $path, $handler, $auth);
    }

    public function add(string $method, string $path, callable $handler, bool $auth): void
    {
        $names = [];
        $pattern = preg_replace_callback('#\{(\w+)\}#', static function (array $m) use (&$names): string {
            $names[] = $m[1];
            return '([^/]+)';
        }, $path);

        $this->routes[] = [
            'method' => $method,
            'regex' => '#^' . $pattern . '$#',
            'names' => $names,
            'handler' => $handler,
            'auth' => $auth,
        ];
    }

    public function dispatch(Request $req): void
    {
        foreach ($this->routes as $route) {
            if ($route['method'] !== $req->method) {
                continue;
            }
            if (!preg_match($route['regex'], $req->path, $matches)) {
                continue;
            }

            $params = [];
            foreach ($route['names'] as $i => $name) {
                $params[$name] = $matches[$i + 1];
            }

            if ($route['auth']) {
                $user = Sessions::currentUser($req);
                if ($user === null) {
                    Response::error('Not authenticated', 401);
                    return;
                }
                $req->user = $user;
                $req->userId = $user['id'];
            }

            ($route['handler'])($req, $params);
            return;
        }

        Response::error('Not found', 404);
    }
}

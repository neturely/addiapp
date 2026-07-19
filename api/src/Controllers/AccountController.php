<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Auth\Passwords;
use App\Auth\Sessions;
use App\Db;
use App\Http\Request;
use App\Http\Response;

/**
 * Account management (#187): the authenticated Settings surface — username
 * (display name) and password. Email change is its own re-verification flow (#200).
 */
final class AccountController
{
    /** PATCH /api/account — update the display name (username). */
    public function update(Request $req, array $params): void
    {
        if (!array_key_exists('displayName', $req->body)) {
            Response::error('No fields to update', 400);
            return;
        }
        $displayName = AuthController::displayName($req->input('displayName'));
        if ($displayName === false) {
            Response::error('Invalid display name (up to 50 characters, no line breaks)', 400);
            return;
        }

        $pdo = Db::pdo();
        $pdo->prepare('UPDATE users SET display_name = ? WHERE id = ?')
            ->execute([$displayName, $req->userId]);

        $stmt = $pdo->prepare('SELECT id, email, display_name FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$req->userId]);
        $row = $stmt->fetch();
        if ($row === false) {
            Response::error('Account not found', 404);
            return;
        }
        Response::json(['user' => AuthController::publicUser($row)]);
    }

    /** POST /api/account/password — change password; requires the current one. */
    public function changePassword(Request $req, array $params): void
    {
        $current = $req->input('currentPassword');
        $next = $req->input('newPassword');
        if (!is_string($current) || $current === '') {
            Response::error('Current password is required', 400);
            return;
        }
        if (!is_string($next) || strlen($next) < 8) {
            Response::error('New password must be at least 8 characters', 400);
            return;
        }

        $pdo = Db::pdo();
        $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$req->userId]);
        $row = $stmt->fetch();
        if ($row === false || !Passwords::verify($current, (string) $row['password_hash'])) {
            Response::error('Current password is incorrect', 400);
            return;
        }

        $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            ->execute([Passwords::hash($next), $req->userId]);

        // Keep this session live; revoke the user's OTHER sessions so a password
        // change invalidates any cookie stolen elsewhere.
        $sid = $req->cookies[Sessions::COOKIE] ?? null;
        Sessions::deleteUserSessionsExcept((int) $req->userId, is_string($sid) ? $sid : null);

        Response::noContent();
    }
}

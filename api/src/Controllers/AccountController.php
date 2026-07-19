<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Auth\EmailTokens;
use App\Auth\Passwords;
use App\Auth\Sessions;
use App\Db;
use App\Email\Mailer;
use App\Email\Templates;
use App\Http\Request;
use App\Http\Response;
use App\RateLimit;

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

    /**
     * POST /api/account/email — request an email change (#200). Stores the new
     * address as `pending_email` and emails a confirm link to it; the swap happens
     * only when that link is confirmed. Non-enumerating: always the same neutral
     * 200, and it only acts when the address is actually free (so it can't probe
     * which emails exist). Rate-limited like the other email-sending endpoints.
     */
    public function changeEmail(Request $req, array $params): void
    {
        if (!RateLimit::check('change-email', $req->clientIp())) {
            Response::error('Too many requests, please try again later.', 429);
            return;
        }
        $newEmail = AuthController::email($req->input('email'));
        if ($newEmail === null) {
            Response::error('Invalid input', 400);
            return;
        }

        $pdo = Db::pdo();
        $cur = $pdo->prepare('SELECT email FROM users WHERE id = ? LIMIT 1');
        $cur->execute([$req->userId]);
        $curRow = $cur->fetch();
        $currentEmail = $curRow !== false ? (string) $curRow['email'] : '';

        // Only act when the address differs from the current one AND isn't already
        // taken; otherwise fall through to the identical neutral response.
        if (strcasecmp($newEmail, $currentEmail) !== 0) {
            $exists = $pdo->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
            $exists->execute([$newEmail]);
            if ($exists->fetch() === false) {
                $pdo->prepare('UPDATE users SET pending_email = ? WHERE id = ?')
                    ->execute([$newEmail, $req->userId]);
                Mailer::sendBestEffort(
                    "email-change for user {$req->userId} -> <{$newEmail}>",
                    Templates::emailChange($newEmail, EmailTokens::create((int) $req->userId, 'email_change')),
                );
            }
        }

        Response::json(['message' => 'If that address is available, we sent it a confirmation link.']);
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

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
use App\Tasks\Selection;

/**
 * Account management (#187): the authenticated Settings surface — username
 * (display name) and password. Email change is its own re-verification flow (#200).
 */
final class AccountController
{
    /**
     * PATCH /api/account — update the display name and/or the Play selection
     * strategy (#266; validated against the Selection::strategies() seam).
     */
    public function update(Request $req, array $params): void
    {
        $sets = [];
        $args = [];

        if (array_key_exists('displayName', $req->body)) {
            $displayName = AuthController::displayName($req->input('displayName'));
            if ($displayName === false) {
                Response::error('Invalid display name (up to 50 characters, no line breaks)', 400);
                return;
            }
            $sets[] = 'display_name = ?';
            $args[] = $displayName;
        }
        if (array_key_exists('selectionStrategy', $req->body)) {
            $strategy = $req->input('selectionStrategy');
            if (!is_string($strategy) || !array_key_exists($strategy, Selection::strategies())) {
                Response::error('Invalid selection strategy', 400);
                return;
            }
            $sets[] = 'selection_strategy = ?';
            $args[] = $strategy;
        }
        if (count($sets) === 0) {
            Response::error('No fields to update', 400);
            return;
        }

        $pdo = Db::pdo();
        $args[] = $req->userId;
        $pdo->prepare('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = ?')
            ->execute($args);

        $stmt = $pdo->prepare(
            'SELECT id, email, display_name, selection_strategy FROM users WHERE id = ? LIMIT 1',
        );
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

    /**
     * POST /api/auth/logout-others (#266) — revoke every OTHER session (the
     * avatar menu's "Sign out other devices"), keeping this one. DB-backed
     * sessions make the revocation immediate.
     */
    public function logoutOthers(Request $req, array $params): void
    {
        $sid = $req->cookies[Sessions::COOKIE] ?? null;
        Sessions::deleteUserSessionsExcept((int) $req->userId, is_string($sid) ? $sid : null);
        Response::noContent();
    }

    /**
     * DELETE /api/account (#266) — permanent account deletion. Requires the
     * current password (re-auth); rate-limited. Every user-owned table cascades
     * off the users row (sessions/tasks/projects/points_log/daily_stats/
     * email_tokens are all ON DELETE CASCADE — verified against migration 001+),
     * so one DELETE removes everything. `rate_limits` has no user FK (buckets
     * are `action:sha1(identifier)`), so matching buckets are swept explicitly.
     * A goodbye notice is sent best-effort AFTER the delete (its failure can't
     * undo anything, matching register's #67 stance).
     */
    public function destroy(Request $req, array $params): void
    {
        if (!RateLimit::check('delete-account', $req->clientIp())) {
            Response::error('Too many requests, please try again later.', 429);
            return;
        }

        $password = $req->input('password');
        if (!is_string($password) || $password === '') {
            Response::error('Your password is required to delete the account', 400);
            return;
        }

        $pdo = Db::pdo();
        $stmt = $pdo->prepare('SELECT email, password_hash FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$req->userId]);
        $row = $stmt->fetch();
        if ($row === false || !Passwords::verify($password, (string) $row['password_hash'])) {
            Response::error('Password is incorrect', 400);
            return;
        }
        $email = (string) $row['email'];

        // Sweep rate-limit buckets keyed by this email (the identifier is hashed
        // into the bucket, so match on the hash; IP buckets are shared + expiring
        // and carry no account data).
        $hash = sha1($email);
        $pdo->prepare('DELETE FROM rate_limits WHERE bucket LIKE ?')->execute(['%:' . $hash]);

        // The cascade: one row, everything user-owned goes with it.
        $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$req->userId]);

        Mailer::sendBestEffort(
            "account-deleted notice for <{$email}>",
            Templates::accountDeleted($email),
        );

        Sessions::clearCookie();
        Response::noContent();
    }
}

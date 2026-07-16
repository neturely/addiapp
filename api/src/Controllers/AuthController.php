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
use App\Turnstile;

final class AuthController
{
    /** POST /register — creates an unverified account and emails a link. No login. */
    public function register(Request $req, array $params): void
    {
        if (!RateLimit::check('register', $req->clientIp(), 10)) {
            Response::error('Too many requests, please try again later.', 429);
            return;
        }
        if (!Turnstile::verify($req->input('turnstileToken'), $req->clientIp())) {
            Response::error('captcha_failed', 400, 'Captcha verification failed. Please try again.');
            return;
        }

        $email = self::email($req->input('email'));
        $password = $req->input('password');
        $displayName = self::displayName($req->input('displayName'));

        if ($email === null) {
            Response::error('Invalid input', 400);
            return;
        }
        if (!is_string($password) || strlen($password) < 8) {
            Response::error('Password must be at least 8 characters', 400);
            return;
        }

        $pdo = Db::pdo();
        $exists = $pdo->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
        $exists->execute([$email]);
        $alreadyRegistered = $exists->fetch() !== false;

        // Non-enumerating (SEC-2, #118): return the SAME response whether or not
        // the address already has an account, so /register can't be used to probe
        // which emails exist (login/forgot-password/resend are already neutral).
        // For an existing account we do NOTHING — no insert, and critically no
        // re-sent verification email (re-sending would leak via behaviour/timing).
        if (!$alreadyRegistered) {
            $ins = $pdo->prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)');
            $ins->execute([$email, Passwords::hash($password), $displayName]);
            $userId = (int) $pdo->lastInsertId();

            // The account exists now — a failed verification email must NOT fail
            // the registration (#67); logged, recoverable via /resend-verification.
            Mailer::sendBestEffort(
                "verification for user {$userId} <{$email}>",
                Templates::verification($email, EmailTokens::create($userId, 'verify')),
            );
        }

        // Neutral message — true whether the account was just created or already
        // existed. Identical status + body in both cases.
        Response::json([
            'message' => 'Check your email to verify your address before signing in.',
            'email' => $email,
        ], 201);
    }

    /** POST /login — blocks unverified accounts (403 email_not_verified). */
    public function login(Request $req, array $params): void
    {
        $email = self::email($req->input('email'));
        $password = $req->input('password');
        if ($email === null || !is_string($password) || $password === '') {
            Response::error('Invalid credentials', 400);
            return;
        }

        // Throttle before the (expensive) bcrypt verify: per-IP (20) is the primary
        // brute-force defence against a single host. The per-email bucket is set
        // HIGH (50) on purpose (SEC-3, #120): a low cap let anyone who knows your
        // email burn your attempts and lock out your real logins — and it counts
        // successful logins too. 50 still trips genuinely distributed targeting of
        // one account (many IPs) without making a targeted lockout cheap.
        // Fires regardless of whether the account exists (no enumeration).
        if (
            !RateLimit::check('login-ip', $req->clientIp(), 20)
            || !RateLimit::check('login-email', $email, 50)
        ) {
            Response::error('Too many login attempts, please try again later.', 429);
            return;
        }

        $stmt = Db::pdo()->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if ($user === false || !Passwords::verify($password, $user['password_hash'])) {
            Response::error('Invalid email or password', 401);
            return;
        }
        if ((int) $user['email_verified'] !== 1) {
            Response::error('email_not_verified', 403, 'Please verify your email before signing in.');
            return;
        }

        Sessions::setCookie(Sessions::create((int) $user['id']));
        Response::json(['user' => self::publicUser($user)]);
    }

    /** POST /verify — consume a verification token, mark verified, log in. */
    public function verify(Request $req, array $params): void
    {
        $token = $req->input('token');
        if (!is_string($token) || $token === '') {
            Response::error('Invalid token', 400);
            return;
        }
        $userId = EmailTokens::consume($token, 'verify');
        if ($userId === null) {
            Response::error('This verification link is invalid or has expired.', 400);
            return;
        }

        $pdo = Db::pdo();
        $pdo->prepare('UPDATE users SET email_verified = 1 WHERE id = ?')->execute([$userId]);
        $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);
        $user = $stmt->fetch();
        if ($user === false) {
            Response::error('Account no longer exists.', 400);
            return;
        }

        Sessions::setCookie(Sessions::create((int) $user['id']));
        Response::json(['user' => self::publicUser($user)]);
    }

    /** POST /resend-verification — always 200 (no enumeration), rate-limited. */
    public function resendVerification(Request $req, array $params): void
    {
        if (!RateLimit::check('resend-verification', $req->clientIp())) {
            Response::error('Too many requests, please try again later.', 429);
            return;
        }
        $email = self::email($req->input('email'));
        if ($email === null) {
            Response::error('Invalid email', 400);
            return;
        }

        $stmt = Db::pdo()->prepare('SELECT id, email, email_verified FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        if ($user !== false && (int) $user['email_verified'] !== 1) {
            Mailer::sendBestEffort(
                "resend-verification for user {$user['id']} <{$user['email']}>",
                Templates::verification($user['email'], EmailTokens::create((int) $user['id'], 'verify')),
            );
        }

        Response::json(['message' => 'If that account exists and is unverified, a new verification link has been sent.']);
    }

    /** POST /forgot-password — always 200 (no enumeration), rate-limited. */
    public function forgotPassword(Request $req, array $params): void
    {
        if (!RateLimit::check('forgot-password', $req->clientIp())) {
            Response::error('Too many requests, please try again later.', 429);
            return;
        }
        // Captcha failure is about the challenge, not the account — safe to 400
        // without leaking whether the email exists (non-enumeration preserved).
        if (!Turnstile::verify($req->input('turnstileToken'), $req->clientIp())) {
            Response::error('captcha_failed', 400, 'Captcha verification failed. Please try again.');
            return;
        }
        $email = self::email($req->input('email'));
        if ($email === null) {
            Response::error('Invalid email', 400);
            return;
        }

        $stmt = Db::pdo()->prepare('SELECT id, email FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        if ($user !== false) {
            Mailer::sendBestEffort(
                "password reset for user {$user['id']} <{$user['email']}>",
                Templates::passwordReset($user['email'], EmailTokens::create((int) $user['id'], 'reset')),
            );
        }

        Response::json(['message' => 'If an account exists for that email, a password reset link has been sent.']);
    }

    /** POST /reset-password — validate token, set new password, revoke sessions. */
    public function resetPassword(Request $req, array $params): void
    {
        $token = $req->input('token');
        $password = $req->input('password');
        if (!is_string($token) || $token === '') {
            Response::error('Invalid input', 400);
            return;
        }
        if (!is_string($password) || strlen($password) < 8) {
            Response::error('Password must be at least 8 characters', 400);
            return;
        }

        $userId = EmailTokens::consume($token, 'reset');
        if ($userId === null) {
            Response::error('This reset link is invalid or has expired.', 400);
            return;
        }

        Db::pdo()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            ->execute([Passwords::hash($password), $userId]);
        Sessions::deleteUserSessions($userId);

        Response::json(['message' => 'Your password has been reset. You can now sign in.']);
    }

    public function logout(Request $req, array $params): void
    {
        $sid = $req->cookies[Sessions::COOKIE] ?? null;
        if (is_string($sid) && $sid !== '') {
            Sessions::delete($sid);
        }
        Sessions::clearCookie();
        Response::noContent();
    }

    public function me(Request $req, array $params): void
    {
        Response::json(['user' => $req->user]);
    }

    // --- helpers ---

    private static function email(mixed $v): ?string
    {
        return is_string($v) && filter_var($v, FILTER_VALIDATE_EMAIL) ? $v : null;
    }

    private static function displayName(mixed $v): ?string
    {
        if (!is_string($v)) {
            return null;
        }
        $t = trim($v);
        return $t === '' ? null : mb_substr($t, 0, 100);
    }

    /** @return array{id:int,email:string,displayName:?string} */
    private static function publicUser(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'email' => $row['email'],
            'displayName' => $row['display_name'],
        ];
    }
}

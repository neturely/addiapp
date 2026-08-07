<?php

declare(strict_types=1);

namespace Tests\Db;

use App\Auth\Passwords;
use App\Auth\Sessions;
use App\Auth\Totp;
use App\Controllers\AccountController;
use App\Controllers\AuthController;
use App\Http\Request;
use App\Http\Router;

/**
 * Request-level TOTP 2FA flow (#319), through the real router + controllers:
 * enroll → confirm → two-step login → verify-otp mints a session; challenges
 * are single-use and guessing is rate-limited; backup codes work exactly once;
 * disable restores the one-step login.
 */
final class TotpFlowTest extends DbTestCase
{
    private const PASSWORD = 'correct horse battery';

    private function router(): Router
    {
        $auth = new AuthController();
        $account = new AccountController();
        $router = new Router();
        $router->post('/api/auth/login', [$auth, 'login']);
        $router->post('/api/auth/verify-otp', [$auth, 'verifyOtp']);
        $router->post('/api/account/totp/setup', [$account, 'totpSetup'], true);
        $router->post('/api/account/totp/confirm', [$account, 'totpConfirm'], true);
        $router->post('/api/account/totp/disable', [$account, 'totpDisable'], true);
        return $router;
    }

    /**
     * Dispatch and return [status, decoded JSON body].
     * @param array<string,mixed> $body
     * @return array{0:int,1:array<string,mixed>}
     */
    private function dispatch(string $method, string $path, array $body = [], ?string $sid = null): array
    {
        $req = new Request($method, $path, [], $body, $sid !== null ? ['sid' => $sid] : []);
        http_response_code(200);
        ob_start();
        try {
            $this->router()->dispatch($req);
        } finally {
            $out = ob_get_clean();
        }
        $decoded = json_decode((string) $out, true);
        return [http_response_code(), is_array($decoded) ? $decoded : []];
    }

    /** Create a verified user with a real bcrypt password; returns [id, sid]. */
    private function makeTotpUser(string $email): array
    {
        $this->pdo->prepare(
            'INSERT INTO users (email, password_hash, email_verified) VALUES (?, ?, 1)',
        )->execute([$email, Passwords::hash(self::PASSWORD)]);
        $id = (int) $this->pdo->lastInsertId();
        return [$id, Sessions::create($id)];
    }

    /** Enroll + confirm 2FA for the user; returns [secret, backupCodes]. */
    private function enroll(string $sid): array
    {
        [$status, $body] = $this->dispatch('POST', '/api/account/totp/setup', ['password' => self::PASSWORD], $sid);
        self::assertSame(200, $status);
        $secret = (string) $body['secret'];
        self::assertNotSame('', $secret);
        self::assertStringContainsString('otpauth://totp/AddiApp:', (string) $body['otpauthUri']);

        [$status, $body] = $this->dispatch(
            'POST',
            '/api/account/totp/confirm',
            ['code' => Totp::code($secret, time())],
            $sid,
        );
        self::assertSame(200, $status);
        self::assertCount(10, $body['backupCodes']);
        return [$secret, $body['backupCodes']];
    }

    public function testEnrollConfirmLoginChallengeAndVerifyOtpMintsSession(): void
    {
        [$userId, $sid] = $this->makeTotpUser('totp-happy@test.local');
        [$secret] = $this->enroll($sid);

        // Login: correct password no longer signs in — challenge instead.
        [$status, $body] = $this->dispatch('POST', '/api/auth/login', [
            'email' => 'totp-happy@test.local',
            'password' => self::PASSWORD,
        ]);
        self::assertSame(403, $status);
        self::assertSame('totp_required', $body['error']);
        $challenge = (string) $body['challenge'];
        self::assertNotSame('', $challenge);

        // Wrong code: rejected, challenge stays live for the retry.
        [$status] = $this->dispatch('POST', '/api/auth/verify-otp', [
            'challenge' => $challenge,
            'code' => '000000',
        ]);
        self::assertSame(401, $status);

        $before = $this->countSessions($userId);
        [$status, $body] = $this->dispatch('POST', '/api/auth/verify-otp', [
            'challenge' => $challenge,
            'code' => Totp::code($secret, time()),
        ]);
        self::assertSame(200, $status);
        self::assertSame($userId, $body['user']['id']);
        self::assertTrue($body['user']['totpEnabled']);
        self::assertSame($before + 1, $this->countSessions($userId), 'verify-otp minted a session');

        // The challenge was consumed — replaying it fails even with a good code.
        [$status] = $this->dispatch('POST', '/api/auth/verify-otp', [
            'challenge' => $challenge,
            'code' => Totp::code($secret, time()),
        ]);
        self::assertSame(401, $status);
    }

    public function testBogusAndExpiredChallengesFail(): void
    {
        [, $sid] = $this->makeTotpUser('totp-expiry@test.local');
        [$secret] = $this->enroll($sid);

        [$status] = $this->dispatch('POST', '/api/auth/verify-otp', [
            'challenge' => bin2hex(random_bytes(32)),
            'code' => Totp::code($secret, time()),
        ]);
        self::assertSame(401, $status);

        [, $body] = $this->dispatch('POST', '/api/auth/login', [
            'email' => 'totp-expiry@test.local',
            'password' => self::PASSWORD,
        ]);
        $challenge = (string) $body['challenge'];
        $this->pdo->prepare('UPDATE email_tokens SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE token = ?')
            ->execute([$challenge]);
        [$status, $body] = $this->dispatch('POST', '/api/auth/verify-otp', [
            'challenge' => $challenge,
            'code' => Totp::code($secret, time()),
        ]);
        self::assertSame(401, $status);
        self::assertSame('totp_challenge_expired', $body['error']);
    }

    public function testBackupCodeSignsInExactlyOnce(): void
    {
        [$userId, $sid] = $this->makeTotpUser('totp-backup@test.local');
        [, $backupCodes] = $this->enroll($sid);
        $code = $backupCodes[0];

        [, $body] = $this->dispatch('POST', '/api/auth/login', [
            'email' => 'totp-backup@test.local',
            'password' => self::PASSWORD,
        ]);
        [$status, $body] = $this->dispatch('POST', '/api/auth/verify-otp', [
            'challenge' => (string) $body['challenge'],
            'code' => $code,
        ]);
        self::assertSame(200, $status);
        self::assertSame($userId, $body['user']['id']);

        // The same code again, on a fresh challenge: spent.
        [, $body] = $this->dispatch('POST', '/api/auth/login', [
            'email' => 'totp-backup@test.local',
            'password' => self::PASSWORD,
        ]);
        [$status] = $this->dispatch('POST', '/api/auth/verify-otp', [
            'challenge' => (string) $body['challenge'],
            'code' => $code,
        ]);
        self::assertSame(401, $status);
    }

    public function testVerifyOtpRateLimitTrips(): void
    {
        [, $sid] = $this->makeTotpUser('totp-limit@test.local');
        $this->enroll($sid);

        [, $body] = $this->dispatch('POST', '/api/auth/login', [
            'email' => 'totp-limit@test.local',
            'password' => self::PASSWORD,
        ]);
        $challenge = (string) $body['challenge'];

        // Per-challenge cap is 10: the 11th guess answers 429, not 401.
        for ($i = 0; $i < 10; $i++) {
            [$status] = $this->dispatch('POST', '/api/auth/verify-otp', [
                'challenge' => $challenge,
                'code' => '000000',
            ]);
            self::assertSame(401, $status);
        }
        [$status] = $this->dispatch('POST', '/api/auth/verify-otp', [
            'challenge' => $challenge,
            'code' => '000000',
        ]);
        self::assertSame(429, $status);
    }

    public function testDisableRestoresOneStepLoginAndClearsState(): void
    {
        [$userId, $sid] = $this->makeTotpUser('totp-disable@test.local');
        [$secret] = $this->enroll($sid);

        // Wrong code refuses to disable.
        [$status] = $this->dispatch('POST', '/api/account/totp/disable', [
            'password' => self::PASSWORD,
            'code' => '000000',
        ], $sid);
        self::assertSame(400, $status);

        [$status] = $this->dispatch('POST', '/api/account/totp/disable', [
            'password' => self::PASSWORD,
            'code' => Totp::code($secret, time()),
        ], $sid);
        self::assertSame(204, $status);

        $row = $this->pdo->query("SELECT totp_secret, totp_enabled FROM users WHERE id = {$userId}")->fetch();
        self::assertNull($row['totp_secret']);
        self::assertSame(0, (int) $row['totp_enabled']);
        $codes = $this->pdo->query("SELECT COUNT(*) FROM backup_codes WHERE user_id = {$userId}")->fetchColumn();
        self::assertSame(0, (int) $codes);

        [$status, $body] = $this->dispatch('POST', '/api/auth/login', [
            'email' => 'totp-disable@test.local',
            'password' => self::PASSWORD,
        ]);
        self::assertSame(200, $status);
        self::assertFalse($body['user']['totpEnabled']);
    }

    public function testConfirmWithoutStagedSecretIs400(): void
    {
        [, $sid] = $this->makeTotpUser('totp-nostage@test.local');
        [$status] = $this->dispatch('POST', '/api/account/totp/confirm', ['code' => '123456'], $sid);
        self::assertSame(400, $status);
    }

    public function testSetupRequiresTheCorrectPassword(): void
    {
        [, $sid] = $this->makeTotpUser('totp-reauth@test.local');
        [$status] = $this->dispatch('POST', '/api/account/totp/setup', ['password' => 'wrong-password'], $sid);
        self::assertSame(400, $status);
    }

    private function countSessions(int $userId): int
    {
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM sessions WHERE user_id = ?');
        $stmt->execute([$userId]);
        return (int) $stmt->fetchColumn();
    }
}

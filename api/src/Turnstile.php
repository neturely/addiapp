<?php

declare(strict_types=1);

namespace App;

/**
 * Cloudflare Turnstile server-side verification (#79). An abuse-prone endpoint
 * calls verify() with the widget token before proceeding.
 *
 * When no secret is configured the check is skipped (returns true) — mirrors the
 * Resend-empty-key convention so local dev works without a Cloudflare account.
 * With a secret set it fails CLOSED: a missing/blank/invalid token or an
 * unreachable siteverify all reject, since the whole site sits behind Cloudflare
 * anyway (if CF is down the site is unreachable regardless).
 */
final class Turnstile
{
    private const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

    public static function verify(mixed $token, string $remoteIp): bool
    {
        $secret = Config::get('turnstileSecret');
        if (!is_string($secret) || $secret === '') {
            return true; // feature disabled (no secret configured — local dev)
        }
        if (!is_string($token) || $token === '') {
            return false;
        }

        $ch = curl_init(self::SITEVERIFY);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_POSTFIELDS => http_build_query([
                'secret' => $secret,
                'response' => $token,
                'remoteip' => $remoteIp,
            ]),
        ]);
        $body = curl_exec($ch);
        $err = curl_error($ch);

        if ($body === false || $err !== '') {
            return false; // fail closed on an unverifiable challenge
        }
        $data = json_decode((string) $body, true);
        return is_array($data) && ($data['success'] ?? false) === true;
    }
}

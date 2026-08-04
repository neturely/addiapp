<?php

declare(strict_types=1);

namespace App\Auth;

/**
 * Display-name profanity blocklist (#340) — a deliberately small, severe-only
 * English wordlist. Matching is case-insensitive SUBSTRING over a normalized
 * form (lowercased, everything but a-z stripped), so spaced/punctuated
 * variants ("f.u.c.k") are caught.
 *
 * Curation rules (keep these when editing):
 * - Severe words and slurs only — this is not a general profanity filter.
 * - Substring matching means every entry must be checked against common
 *   words/names it could sit inside (e.g. "coon" ⊂ raccoon/tycoon and
 *   "spic" ⊂ conspicuous are deliberately ABSENT). Known accepted
 *   trade-off: "cunt" ⊂ Scunthorpe.
 * - No leetspeak/homoglyph handling in v1 (decided in #340) — don't add
 *   half-measures here; revisit the approach instead.
 */
final class DisplayNameBlocklist
{
    private const BLOCKED = [
        // Slurs
        'nigger',
        'nigga',
        'faggot',
        'kike',
        'chink',
        'wetback',
        'raghead',
        'tranny',
        // Severe profanity
        'fuck',
        'cunt',
        'shit',
        'bitch',
        'asshole',
        'twat',
        'wanker',
        'whore',
        'slut',
        'jizz',
        'dildo',
    ];

    public static function isAllowed(string $name): bool
    {
        $normalized = preg_replace('/[^a-z]+/', '', mb_strtolower($name)) ?? '';
        if ($normalized === '') {
            return true;
        }
        foreach (self::BLOCKED as $word) {
            if (str_contains($normalized, $word)) {
                return false;
            }
        }

        return true;
    }
}

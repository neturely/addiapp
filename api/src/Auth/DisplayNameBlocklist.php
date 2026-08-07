<?php

declare(strict_types=1);

namespace App\Auth;

/**
 * Display-name profanity blocklist (#340; expanded in the 2.3.0 review round) —
 * a deliberately severe-only English wordlist. Matching is case-insensitive
 * SUBSTRING over a normalized form: lowercased, common leetspeak substitutions
 * mapped back to letters (0→o, 1→i, 3→e, …), then everything but a-z stripped —
 * so "f.u.c.k", "f u c k", "f0ck" and "b17ch" are all caught.
 *
 * Curation rules (keep these when editing):
 * - Severe words and slurs only — this is not a general profanity filter.
 * - Substring matching means every entry must be checked against common
 *   words/names it could sit inside (e.g. "coon" ⊂ raccoon/tycoon, "spic" ⊂
 *   conspicuous, "gook" ⊂ gobbledygook, "dyke" ⊂ Van Dyke, "cock" ⊂ Hitchcock
 *   are deliberately ABSENT — use the compound forms instead). Known accepted
 *   trade-off: "cunt" ⊂ Scunthorpe.
 * - The LEET map runs BEFORE the strip, so an entry must also be checked
 *   against names containing digits (e.g. "1" reads as "i", "5" as "s").
 *   Unmapped characters simply vanish, as before.
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
        'beaner',
        'shemale',
        'towelhead',
        'porchmonkey',
        // Severe profanity
        'fuck',
        'fvck',
        'phuck',
        'cunt',
        'cvnt',
        'kunt',
        'shit',
        'bitch',
        'asshole',
        'twat',
        'wanker',
        'whore',
        'slut',
        'jizz',
        'dildo',
        'cocksucker',
        'dickhead',
        'pussy',
        'retard',
        'blowjob',
        'handjob',
    ];

    /** Leetspeak/symbol substitutions applied before the a-z strip (2.3.0
     *  review round — supersedes the #340 "no leetspeak in v1" decision). */
    private const LEET = [
        '0' => 'o',
        '1' => 'i',
        '3' => 'e',
        '4' => 'a',
        '5' => 's',
        '7' => 't',
        '8' => 'b',
        '@' => 'a',
        '$' => 's',
        '!' => 'i',
        '+' => 't',
    ];

    public static function isAllowed(string $name): bool
    {
        $lower = mb_strtolower($name);
        // TWO normal forms, both checked: leet-substituted (b1tch → bitch) and
        // plain-stripped, where digits/symbols act as SEPARATORS (fu1ck → fuck
        // — the v1 behaviour, which a substitution-only pass would lose).
        $forms = [
            preg_replace('/[^a-z]+/', '', strtr($lower, self::LEET)) ?? '',
            preg_replace('/[^a-z]+/', '', $lower) ?? '',
        ];
        foreach (self::BLOCKED as $word) {
            foreach ($forms as $form) {
                if ($form !== '' && str_contains($form, $word)) {
                    return false;
                }
            }
        }

        return true;
    }
}

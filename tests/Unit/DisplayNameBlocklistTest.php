<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Auth\DisplayNameBlocklist;
use App\Controllers\AuthController;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class DisplayNameBlocklistTest extends TestCase
{
    /** @return array<string,array{string}> */
    public static function blockedNames(): array
    {
        return [
            'plain word' => ['fuck'],
            'uppercase' => ['FUCK'],
            'mixed case' => ['FuCk'],
            'embedded in a longer name' => ['fuckface99'],
            'dot-separated' => ['f.u.c.k'],
            'space-separated' => ['f u c k'],
            'digits as separators' => ['fu1ck'],
            'slur' => ['nigger'],
            'accepted Scunthorpe trade-off' => ['Scunthorpe'],
            // Leetspeak substitutions (2.3.0 review round)
            'leet: b1tch' => ['b1tch'],
            'leet: sh1t' => ['Sh1thead'],
            'leet: a55hole' => ['a55hole'],
            'leet: wh0re' => ['wh0re'],
            'leet: multiple substitutions' => ['b17ch'],
            'leet: symbol substitution' => ['a$$hole'],
            'vowel-swap variant: fvck' => ['fvck'],
            'ph variant: phuck' => ['phuck'],
            'expanded entry: cocksucker' => ['c0cksucker'],
            'expanded entry: retard' => ['retard99'],
        ];
    }

    #[DataProvider('blockedNames')]
    public function testBlocked(string $name): void
    {
        $this->assertFalse(DisplayNameBlocklist::isAllowed($name));
    }

    /** @return array<string,array{string}> */
    public static function cleanNames(): array
    {
        return [
            'plain name' => ['Elise'],
            'hyphenated' => ['Anna-Karin'],
            'initials' => ['JC'],
            'substring traps avoided: raccoon' => ['Raccoon Fan'],
            'substring traps avoided: conspicuous' => ['Conspicuous'],
            'substring traps avoided: Hitchcock' => ['Hitchcock'],
            'substring traps avoided: therapist' => ['The Therapist'],
            'non-latin only (normalizes to empty)' => ['日本語の名前'],
            'emoji + name' => ['⭐ Star'],
            // Leet map must not corrupt ordinary digit-carrying names
            'digits in a normal name' => ['Elise2024'],
            'leet-looking but clean' => ['S1mon 5venson'],
            'substring traps avoided: Phuket' => ['Phuket Traveller'],
            'substring traps avoided: FC initials' => ['FC Köln fan'],
        ];
    }

    #[DataProvider('cleanNames')]
    public function testAllowed(string $name): void
    {
        $this->assertTrue(DisplayNameBlocklist::isAllowed($name));
    }

    public function testValidatorRejectsBlockedName(): void
    {
        $this->assertFalse(AuthController::displayName('fuck'));
    }

    public function testValidatorStillAcceptsCleanName(): void
    {
        $this->assertSame('Elise', AuthController::displayName('Elise'));
    }
}

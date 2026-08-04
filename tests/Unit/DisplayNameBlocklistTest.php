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

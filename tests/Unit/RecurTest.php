<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Tasks\Recur;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class RecurTest extends TestCase
{
    /** @return array<string,array{string,string,int,string}> */
    public static function intervalCases(): array
    {
        return [
            'daily' => ['2026-08-04', 'day', 1, '2026-08-05'],
            'every 3 days' => ['2026-08-04', 'day', 3, '2026-08-07'],
            'weekly' => ['2026-08-04', 'week', 1, '2026-08-11'],
            'every 2 weeks' => ['2026-08-04', 'week', 2, '2026-08-18'],
            'monthly' => ['2026-08-04', 'month', 1, '2026-09-04'],
            'every 2 months' => ['2026-08-04', 'month', 2, '2026-10-04'],
            'day across month end' => ['2026-08-31', 'day', 1, '2026-09-01'],
            'day across year end' => ['2026-12-31', 'day', 1, '2027-01-01'],
            'month clamps 31 -> 30' => ['2026-08-31', 'month', 1, '2026-09-30'],
            'month clamps 31 -> Feb 28' => ['2026-01-31', 'month', 1, '2026-02-28'],
            'month clamps to leap Feb 29' => ['2028-01-31', 'month', 1, '2028-02-29'],
            'month across year end' => ['2026-11-15', 'month', 3, '2027-02-15'],
            'december + 1 month' => ['2026-12-05', 'month', 1, '2027-01-05'],
        ];
    }

    #[DataProvider('intervalCases')]
    public function testNextFromInterval(string $from, string $unit, int $n, string $expected): void
    {
        $this->assertSame($expected, Recur::nextFromInterval($from, $unit, $n));
    }

    /** @return array<string,array{string,int,string}> */
    public static function dayOfMonthCases(): array
    {
        return [
            'before day D — same month' => ['2026-08-04', 25, '2026-08-25'],
            'ON day D — strictly after, next month' => ['2026-08-25', 25, '2026-09-25'],
            'after day D — next month' => ['2026-08-26', 25, '2026-09-25'],
            'day 31 clamps to Sep 30' => ['2026-08-31', 31, '2026-09-30'],
            'day 31 from mid-month' => ['2026-08-04', 31, '2026-08-31'],
            'day 30 in February clamps to 28' => ['2026-02-01', 30, '2026-02-28'],
            'clamped candidate not after -> next month' => ['2026-02-28', 30, '2026-03-30'],
            'leap February clamps to 29' => ['2028-02-01', 30, '2028-02-29'],
            'december rolls the year' => ['2026-12-26', 25, '2027-01-25'],
            'day 1' => ['2026-08-04', 1, '2026-09-01'],
        ];
    }

    #[DataProvider('dayOfMonthCases')]
    public function testNextFromDayOfMonth(string $from, int $day, string $expected): void
    {
        $this->assertSame($expected, Recur::nextFromDayOfMonth($from, $day));
    }

    public function testNextOccurrenceDispatchesByFamily(): void
    {
        $interval = ['recur_unit' => 'week', 'recur_interval' => 2, 'recur_day_of_month' => null];
        $this->assertSame('2026-08-18', Recur::nextOccurrence($interval, '2026-08-04'));

        $dom = ['recur_unit' => null, 'recur_interval' => null, 'recur_day_of_month' => 25];
        $this->assertSame('2026-08-25', Recur::nextOccurrence($dom, '2026-08-04'));

        $none = ['recur_unit' => null, 'recur_interval' => null, 'recur_day_of_month' => null];
        $this->assertNull(Recur::nextOccurrence($none, '2026-08-04'));
    }

    public function testIsRecurring(): void
    {
        $this->assertTrue(Recur::isRecurring(['recur_unit' => 'day', 'recur_day_of_month' => null]));
        $this->assertTrue(Recur::isRecurring(['recur_unit' => null, 'recur_day_of_month' => 15]));
        $this->assertFalse(Recur::isRecurring(['recur_unit' => null, 'recur_day_of_month' => null]));
        $this->assertFalse(Recur::isRecurring([]));
    }

    public function testInvalidInputsThrow(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        Recur::nextFromInterval('2026-08-04', 'year', 1);
    }

    public function testInvalidDayThrows(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        Recur::nextFromDayOfMonth('2026-08-04', 32);
    }
}

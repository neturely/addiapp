<?php

declare(strict_types=1);

namespace App\Tasks;

/**
 * Recurrence date math (#250) — pure, so it's unit-testable. All inputs and
 * outputs are Y-m-d date STRINGS; the caller decides what "the completion
 * date" is (today in APP_TIMEZONE, at completion time). Two families,
 * mutually exclusive on the task row:
 *
 * - interval: completion date + N units — completion-RELATIVE by design (no
 *   anchor drift: wash the car 3 days late and the next wash is still two
 *   weeks of actual dirt away). Month addition clamps instead of overflowing
 *   (Jan 31 + 1 month = Feb 28/29, never Mar 3).
 * - day-of-month: the next day-D STRICTLY AFTER the completion date ("pay
 *   the bills, after the 25th" completed on the 26th comes back on the next
 *   month's 25th). D = 29-31 clamps to the target month's last day.
 */
final class Recur
{
    private const UNITS = ['day', 'week', 'month'];

    /** Whether a task row carries a recurrence rule (either family). */
    public static function isRecurring(array $task): bool
    {
        return ($task['recur_unit'] ?? null) !== null
            || ($task['recur_day_of_month'] ?? null) !== null;
    }

    /**
     * Next occurrence for the task's rule, or null when it has none.
     * $completionDate is Y-m-d (already in the app timezone).
     */
    public static function nextOccurrence(array $task, string $completionDate): ?string
    {
        $day = $task['recur_day_of_month'] ?? null;
        if ($day !== null) {
            return self::nextFromDayOfMonth($completionDate, (int) $day);
        }
        $unit = $task['recur_unit'] ?? null;
        if ($unit !== null) {
            return self::nextFromInterval($completionDate, (string) $unit, (int) ($task['recur_interval'] ?? 1));
        }
        return null;
    }

    /** Interval family: completion date + N units (month-end clamped). */
    public static function nextFromInterval(string $completionDate, string $unit, int $interval): string
    {
        if (!in_array($unit, self::UNITS, true) || $interval < 1) {
            throw new \InvalidArgumentException("Invalid recurrence interval: {$interval} {$unit}");
        }
        $date = new \DateTimeImmutable($completionDate, new \DateTimeZone('UTC'));
        if ($unit !== 'month') {
            return $date->modify("+{$interval} {$unit}")->format('Y-m-d');
        }

        // Month math by hand: PHP's "+1 month" overflows short months.
        $y = (int) $date->format('Y');
        $m = (int) $date->format('n') + $interval;
        $d = (int) $date->format('j');
        $y += intdiv($m - 1, 12);
        $m = (($m - 1) % 12) + 1;
        $d = min($d, self::daysInMonth($y, $m));

        return sprintf('%04d-%02d-%02d', $y, $m, $d);
    }

    /** Day-of-month family: the next day-D strictly after the completion date. */
    public static function nextFromDayOfMonth(string $completionDate, int $dayOfMonth): string
    {
        if ($dayOfMonth < 1 || $dayOfMonth > 31) {
            throw new \InvalidArgumentException("Invalid day of month: {$dayOfMonth}");
        }
        $date = new \DateTimeImmutable($completionDate, new \DateTimeZone('UTC'));
        $y = (int) $date->format('Y');
        $m = (int) $date->format('n');

        $candidate = sprintf('%04d-%02d-%02d', $y, $m, min($dayOfMonth, self::daysInMonth($y, $m)));
        if ($candidate > $completionDate) {
            return $candidate;
        }
        $m++;
        if ($m > 12) {
            $m = 1;
            $y++;
        }

        return sprintf('%04d-%02d-%02d', $y, $m, min($dayOfMonth, self::daysInMonth($y, $m)));
    }

    private static function daysInMonth(int $year, int $month): int
    {
        return (int) (new \DateTimeImmutable(sprintf('%04d-%02d-01', $year, $month), new \DateTimeZone('UTC')))
            ->format('t');
    }
}

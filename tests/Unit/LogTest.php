<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Log;
use PHPUnit\Framework\TestCase;

/**
 * Verifies the structured logger (#122) emits one parseable JSON line per event
 * with the expected fields, and captures request context from $_SERVER. Redirects
 * error_log to a temp file so the real emission path is exercised.
 */
final class LogTest extends TestCase
{
    private string $logFile;
    private string $prevDest;
    private string $prevType;

    protected function setUp(): void
    {
        $this->logFile = tempnam(sys_get_temp_dir(), 'addiapp-log-');
        $this->prevType = (string) ini_get('error_log');
        // message_type 3 (append to file) is selected by pointing error_log at a file.
        $this->prevDest = (string) ini_set('error_log', $this->logFile);
    }

    protected function tearDown(): void
    {
        ini_set('error_log', $this->prevDest === '' ? $this->prevType : $this->prevDest);
        @unlink($this->logFile);
    }

    /** @return array<string,mixed> */
    private function lastEntry(): array
    {
        $lines = array_values(array_filter(explode("\n", (string) file_get_contents($this->logFile))));
        $last = end($lines);
        // error_log prefixes a timestamp header; the JSON is the trailing {...}.
        $json = substr($last, (int) strpos($last, '{'));
        return json_decode($json, true, 512, JSON_THROW_ON_ERROR);
    }

    public function testEmitsStructuredJsonWithLevelAndMessage(): void
    {
        $_SERVER['REQUEST_METHOD'] = 'POST';
        $_SERVER['REQUEST_URI'] = '/api/auth/register?x=1';
        $_SERVER['REMOTE_ADDR'] = '198.51.100.7';
        unset($_SERVER['HTTP_X_FORWARDED_FOR']);

        Log::error('boom', ['context' => 'verify', 'error' => 'timeout']);

        $e = $this->lastEntry();
        self::assertSame('error', $e['level']);
        self::assertSame('addiapp-api', $e['app']);
        self::assertSame('boom', $e['msg']);
        self::assertSame('POST', $e['method']);
        self::assertSame('/api/auth/register', $e['path']); // query stripped
        self::assertSame('198.51.100.7', $e['ip']);
        self::assertSame(['context' => 'verify', 'error' => 'timeout'], $e['ctx']);
        self::assertArrayHasKey('ts', $e);
    }

    public function testPrefersForwardedForAndOmitsEmptyContext(): void
    {
        $_SERVER['HTTP_X_FORWARDED_FOR'] = '203.0.113.9, 10.0.0.1';
        $_SERVER['REMOTE_ADDR'] = '10.0.0.1';

        Log::info('hello');

        $e = $this->lastEntry();
        self::assertSame('info', $e['level']);
        self::assertSame('203.0.113.9', $e['ip']); // first XFF hop wins
        self::assertArrayNotHasKey('ctx', $e); // empty context omitted
    }
}

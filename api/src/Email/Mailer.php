<?php

declare(strict_types=1);

namespace App\Email;

use App\Config;
use App\Log;

/** Email facade: picks the transport (Resend if a key is set, else console). */
final class Mailer
{
    private static ?EmailTransport $transport = null;

    public static function transport(): EmailTransport
    {
        if (self::$transport !== null) {
            return self::$transport;
        }
        $key = (string) Config::get('resendApiKey');
        $from = (string) Config::get('emailFrom');
        return self::$transport = $key !== ''
            ? new ResendTransport($key, $from)
            : new ConsoleTransport();
    }

    public static function send(EmailMessage $message): void
    {
        self::transport()->send($message);
    }

    /**
     * Send without letting a provider hiccup fail the request (issue #67): the
     * DB state is already committed and the user can trigger a resend, so a
     * failure is logged loudly (never swallowed) and does not throw.
     */
    public static function sendBestEffort(string $context, EmailMessage $message): void
    {
        try {
            self::send($message);
        } catch (\Throwable $e) {
            Log::error('email send failed', ['context' => $context, 'error' => $e->getMessage()]);
        }
    }
}

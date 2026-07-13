<?php

declare(strict_types=1);

namespace App\Email;

/**
 * Dev/test transport: logs the email (and any links) to the PHP error log
 * instead of sending. Active when RESEND_API_KEY is unset, so the full flow can
 * be exercised locally.
 */
final class ConsoleTransport implements EmailTransport
{
    public function send(EmailMessage $message): void
    {
        preg_match_all('#https?://[^"\'\s]+#', $message->html, $links);
        $log = "\n──── [email:console] (RESEND_API_KEY unset — not sent) ────\n"
            . "  to:      {$message->to}\n"
            . "  subject: {$message->subject}\n";
        foreach ($links[0] as $link) {
            $log .= "  link:    {$link}\n";
        }
        error_log($log);
    }
}

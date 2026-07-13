<?php

declare(strict_types=1);

namespace App\Email;

/** Resend transport via a direct curl call (decision #4 — no SDK). */
final class ResendTransport implements EmailTransport
{
    public function __construct(
        private readonly string $apiKey,
        private readonly string $from,
    ) {
    }

    public function send(EmailMessage $message): void
    {
        $payload = [
            'from' => $this->from,
            'to' => $message->to,
            'subject' => $message->subject,
            'html' => $message->html,
        ];
        if ($message->text !== '') {
            $payload['text'] = $message->text;
        }

        $ch = curl_init('https://api.resend.com/emails');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $this->apiKey,
                'Content-Type: application/json',
            ],
            CURLOPT_POSTFIELDS => json_encode($payload),
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($body === false || $err !== '') {
            throw new \RuntimeException("Resend request failed: {$err}");
        }
        if ($code < 200 || $code >= 300) {
            $decoded = json_decode((string) $body, true);
            $detail = is_array($decoded) && isset($decoded['message']) ? $decoded['message'] : (string) $body;
            throw new \RuntimeException("Resend send failed ({$code}): {$detail}");
        }
    }
}

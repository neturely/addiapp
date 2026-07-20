<?php

declare(strict_types=1);

namespace App\Email;

use App\Config;

final class Templates
{
    private static function wrap(string $heading, string $body): string
    {
        return '<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:auto">'
            . "<h2>{$heading}</h2>{$body}"
            . '<p style="color:#888;font-size:12px;margin-top:24px">AddiApp · addiapp.com</p></div>';
    }

    public static function verification(string $to, string $token): EmailMessage
    {
        $link = rtrim((string) Config::get('appUrl'), '/') . '/verify?token=' . $token;
        return new EmailMessage(
            $to,
            'Verify your AddiApp email',
            self::wrap(
                'Welcome to AddiApp 🎉',
                "<p>Confirm your email address to activate your account:</p>"
                . "<p><a href=\"{$link}\">Verify my email</a></p>"
                . "<p style=\"color:#666;font-size:13px\">Or paste this link into your browser:<br>{$link}</p>"
                . "<p style=\"color:#666;font-size:13px\">This link expires in 24 hours. If you didn't sign up, you can ignore this email.</p>",
            ),
            "Welcome to AddiApp! Verify your email: {$link} (expires in 24 hours). If you didn't sign up, ignore this email.",
        );
    }

    public static function emailChange(string $to, string $token): EmailMessage
    {
        $link = rtrim((string) Config::get('appUrl'), '/') . '/confirm-email-change?token=' . $token;
        return new EmailMessage(
            $to,
            'Confirm your new AddiApp email',
            self::wrap(
                'Confirm your new email',
                '<p>Confirm this address to make it your new AddiApp sign-in email:</p>'
                . "<p><a href=\"{$link}\">Confirm my new email</a></p>"
                . "<p style=\"color:#666;font-size:13px\">Or paste this link into your browser:<br>{$link}</p>"
                . "<p style=\"color:#666;font-size:13px\">This link expires in 24 hours. If you didn't request this, you can ignore it — your email won't change.</p>",
            ),
            "Confirm your new AddiApp email: {$link} (expires in 24 hours). If you didn't request this, ignore it — your email won't change.",
        );
    }

    public static function passwordReset(string $to, string $token): EmailMessage
    {
        $link = rtrim((string) Config::get('appUrl'), '/') . '/reset?token=' . $token;
        return new EmailMessage(
            $to,
            'Reset your AddiApp password',
            self::wrap(
                'Reset your password',
                "<p>We got a request to reset your AddiApp password. Choose a new one here:</p>"
                . "<p><a href=\"{$link}\">Reset my password</a></p>"
                . "<p style=\"color:#666;font-size:13px\">Or paste this link into your browser:<br>{$link}</p>"
                . "<p style=\"color:#666;font-size:13px\">This link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password won't change.</p>",
            ),
            "Reset your AddiApp password: {$link} (expires in 1 hour). If you didn't request this, ignore this email — your password won't change.",
        );
    }
}

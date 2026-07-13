<?php

declare(strict_types=1);

namespace App\Email;

final class EmailMessage
{
    public function __construct(
        public readonly string $to,
        public readonly string $subject,
        public readonly string $html,
        public readonly string $text = '',
    ) {
    }
}

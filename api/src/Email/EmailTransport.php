<?php

declare(strict_types=1);

namespace App\Email;

/** Provider-agnostic transport. Swapping providers only touches this folder. */
interface EmailTransport
{
    public function send(EmailMessage $message): void;
}

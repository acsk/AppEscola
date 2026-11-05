<?php

namespace App\Services\Email;

final class EmailSendResult
{
    public function __construct(
        public readonly bool $sent,
        public readonly ?string $messageId = null,
        public readonly ?string $errorCode = null,
        public readonly ?string $error = null,
    ) {
    }

    public static function sent(?string $messageId): self
    {
        return new self(true, $messageId);
    }

    public static function failed(string $code, string $message): self
    {
        return new self(false, null, $code, $message);
    }
}

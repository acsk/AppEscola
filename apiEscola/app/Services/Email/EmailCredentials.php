<?php

namespace App\Services\Email;

/** Credenciais e remetente de um tenant, já decifrados (nunca serializar nem registrar em log). */
final class EmailCredentials
{
    public function __construct(
        public readonly string $apiKey,
        public readonly string $fromEmail,
        public readonly ?string $fromName = null,
        public readonly ?string $replyTo = null,
    ) {
    }

    public function from(): string
    {
        return $this->fromName ? sprintf('%s <%s>', str_replace(['<', '>', '"'], '', $this->fromName), $this->fromEmail) : $this->fromEmail;
    }

    public function domain(): string
    {
        return strtolower(substr(strrchr($this->fromEmail, '@') ?: '', 1));
    }
}

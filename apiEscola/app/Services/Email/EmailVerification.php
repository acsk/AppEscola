<?php

namespace App\Services\Email;

/** Resultado da verificação: chave válida? domínio do remetente pronto para envio? */
final class EmailVerification
{
    /** @param  'verified'|'pending'|'not_found'|'unknown'|null  $domainStatus */
    public function __construct(
        public readonly bool $keyValid,
        public readonly ?string $domainStatus,
        public readonly string $message,
    ) {
    }
}

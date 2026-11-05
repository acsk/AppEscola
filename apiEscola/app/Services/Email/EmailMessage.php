<?php

namespace App\Services\Email;

/** Mensagem independente do provedor. O remetente vem da configuração do tenant. */
final class EmailMessage
{
    /**
     * @param  list<string>  $to
     * @param  array<string, string>  $tags  Marcadores para filtrar no provedor (ex.: categoria).
     */
    public function __construct(
        public readonly array $to,
        public readonly string $subject,
        public readonly ?string $html = null,
        public readonly ?string $text = null,
        public readonly ?string $replyTo = null,
        public readonly array $tags = [],
    ) {
    }
}

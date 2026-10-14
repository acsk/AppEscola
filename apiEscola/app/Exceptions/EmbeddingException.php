<?php

namespace App\Exceptions;

use RuntimeException;

/** Falha do provedor de embeddings. A verificação não pode ser aprovada em silêncio. */
class EmbeddingException extends RuntimeException
{
    public function __construct(
        string $message = 'Não foi possível gerar o embedding. A verificação de semelhança não foi concluída.',
        public readonly string $codigo = 'embedding_unavailable',
    ) {
        parent::__construct($message);
    }
}

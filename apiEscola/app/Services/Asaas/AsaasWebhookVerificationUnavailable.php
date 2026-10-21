<?php

namespace App\Services\Asaas;

use RuntimeException;

/**
 * A cobrança não pôde ser confirmada na API do Asaas (timeout, erro 5xx, credencial inválida).
 * Nada é alterado; o webhook responde 503 para o Asaas reenviar o evento depois.
 */
class AsaasWebhookVerificationUnavailable extends RuntimeException
{
}

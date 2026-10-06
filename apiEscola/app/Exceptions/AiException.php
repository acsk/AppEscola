<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * Erro da integração com IA (mensagem em português, exibida ao usuário como está).
 * 422 = IA não configurada / resposta inutilizável; 502 = falha no provedor.
 * O detalhe técnico vai só para o log (nunca a chave).
 */
class AiException extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 422, public readonly ?string $errorCode = null)
    {
        parent::__construct($message);
    }

    public static function notConfigured(): self
    {
        return new self(
            'A IA não está configurada para esta escola. Cadastre uma chave em Configurações → Integração com IA.',
            422,
            'ai_not_configured'
        );
    }

    public static function provider(string $message = 'O provedor de IA não respondeu. Tente novamente em instantes.'): self
    {
        return new self($message, 502, 'ai_provider_error');
    }

    public static function invalidResponse(): self
    {
        return new self('A IA devolveu uma resposta inválida. Tente novamente.', 502, 'ai_invalid_response');
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'type'    => 'error',
            'message' => $this->getMessage(),
            'body'    => $this->errorCode ? ['code' => $this->errorCode] : null,
        ], $this->status);
    }
}

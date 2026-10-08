<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
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

    /** $detail diz em que etapa a resposta veio fora do formato (ex.: "a descrição da imagem"). */
    public static function invalidResponse(?string $detail = null): self
    {
        $message = $detail === null
            ? 'A IA devolveu uma resposta inválida. Tente novamente.'
            : "A IA devolveu {$detail} fora do formato esperado. Tente novamente.";

        return new self($message, 502, 'ai_invalid_response');
    }

    /**
     * Recusas esperadas (4xx: IA não configurada, imagem ilegível…) não são erro do sistema:
     * uma linha de aviso, sem stack trace. Falhas do provedor (5xx) já são logadas pelo AiChatClient.
     */
    public function report(): bool
    {
        Log::warning('IA: '.$this->getMessage(), ['code' => $this->errorCode, 'status' => $this->status, 'user_id' => auth()->id()]);

        return true;
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'type' => 'error',
            'message' => $this->getMessage(),
            'body' => $this->errorCode ? ['code' => $this->errorCode]
                + ($this->errorCode === 'image_needs_review' ? ['status' => 'NEEDS_REVIEW', 'motivo' => $this->getMessage()] : []) : null,
        ], $this->status);
    }
}

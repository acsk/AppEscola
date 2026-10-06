<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * Erro de regra de negócio do banco de questões (mensagem em português, exibida ao usuário como está).
 * 422 = regra violada (ex.: assunto de outra disciplina); 409 = conflito (nome duplicado, item em uso).
 */
class QuestionBankException extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 422)
    {
        parent::__construct($message);
    }

    public static function conflict(string $message): self
    {
        return new self($message, 409);
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'type'    => 'error',
            'message' => $this->getMessage(),
            'body'    => null,
        ], $this->status);
    }
}

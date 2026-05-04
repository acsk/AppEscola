<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;

/**
 * Controller base da aplicação.
 *
 * Fornece helpers de resposta JSON padronizados para todos os controllers filhos.
 * Todas as respostas seguem o envelope:
 *
 *   { "type": "success"|"error", "message": "...", "body": <dados|null> }
 */
abstract class Controller
{
    /**
     * Resposta de sucesso genérica.
     *
     * @param  mixed   $body    Dados a retornar (resource, array, null…)
     * @param  string  $message Mensagem descritiva
     * @param  int     $status  Código HTTP (padrão 200)
     */
    protected function success(mixed $body = null, string $message = 'Operação realizada com sucesso.', int $status = 200): JsonResponse
    {
        return response()->json([
            'type'    => 'success',
            'message' => $message,
            'body'    => $body,
        ], $status);
    }

    /**
     * Resposta 201 Created — usar após criação de um recurso.
     *
     * @param  mixed   $body    Dados do recurso criado
     * @param  string  $message Mensagem descritiva
     */
    protected function created(mixed $body = null, string $message = 'Criado com sucesso.'): JsonResponse
    {
        return $this->success($body, $message, 201);
    }

    /**
     * Resposta 200 para exclusão bem-sucedida.
     *
     * @param  string  $message Mensagem descritiva
     */
    protected function deleted(string $message = 'Removido com sucesso.'): JsonResponse
    {
        return $this->success(null, $message);
    }

    /**
     * Resposta de erro genérica.
     *
     * @param  string  $message Mensagem descritiva do erro
     * @param  mixed   $body    Dados adicionais (detalhes, contexto…)
     * @param  int     $status  Código HTTP (padrão 400)
     */
    protected function error(string $message = 'Ocorreu um erro.', mixed $body = null, int $status = 400): JsonResponse
    {
        return response()->json([
            'type'    => 'error',
            'message' => $message,
            'body'    => $body,
        ], $status);
    }

    /**
     * Resposta 404 Not Found.
     *
     * @param  string  $message Mensagem descritiva
     */
    protected function notFound(string $message = 'Recurso não encontrado.'): JsonResponse
    {
        return $this->error($message, null, 404);
    }

    /**
     * Resposta 403 Forbidden — acesso negado por permissão ou tenant.
     *
     * @param  string  $message Mensagem descritiva
     */
    protected function forbidden(string $message = 'Acesso não autorizado.'): JsonResponse
    {
        return $this->error($message, null, 403);
    }

    /**
     * Resposta 422 Unprocessable Entity — erros de validação.
     *
     * Os erros são retornados em `body.errors` no mesmo formato do Laravel:
     *   { "field": ["mensagem de erro"] }
     *
     * @param  array   $errors  Mapa campo → lista de erros
     * @param  string  $message Mensagem descritiva
     */
    protected function validationError(array $errors, string $message = 'Dados inválidos.'): JsonResponse
    {
        return response()->json([
            'type'    => 'error',
            'message' => $message,
            'body'    => ['errors' => $errors],
        ], 422);
    }
}

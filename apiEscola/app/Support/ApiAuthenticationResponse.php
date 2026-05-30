<?php

namespace App\Support;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;

class ApiAuthenticationResponse
{
    public static function json(Request $request): JsonResponse
    {
        $token = $request->bearerToken();

        if ($token) {
            $accessToken = PersonalAccessToken::findToken($token);

            if ($accessToken && self::tokenIsExpired($accessToken)) {
                return response()->json([
                    'message' => 'Sua sessão expirou por segurança. Entre novamente com seu login e senha para continuar.',
                    'code' => 'session_expired',
                ], 401);
            }

            if ($accessToken) {
                return response()->json([
                    'message' => 'Não foi possível validar seu acesso. Faça login novamente para continuar.',
                    'code' => 'session_invalid',
                ], 401);
            }
        }

        return response()->json([
            'message' => 'Você precisa estar autenticado para acessar este recurso.',
            'code' => 'unauthenticated',
        ], 401);
    }

    private static function tokenIsExpired(PersonalAccessToken $accessToken): bool
    {
        $expirationMinutes = config('sanctum.expiration');

        if ($expirationMinutes && $accessToken->created_at->lte(now()->subMinutes((int) $expirationMinutes))) {
            return true;
        }

        return $accessToken->expires_at !== null && $accessToken->expires_at->isPast();
    }
}

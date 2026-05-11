<?php

namespace App\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;

class HealthController extends Controller
{
    /**
     * Health check endpoint — verifica se a API está operacional.
     * Rota pública — sem autenticação.
     */
    public function check(): JsonResponse
    {
        return response()->json([
            'type'    => 'success',
            'message' => 'API is running.',
            'body'    => [
                'status'     => 'ok',
                'timestamp'  => now()->toISOString(),
                'app_name'   => config('app.name'),
                'environment' => config('app.env'),
            ],
        ]);
    }
}

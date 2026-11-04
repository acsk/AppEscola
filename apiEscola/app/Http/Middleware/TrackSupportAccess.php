<?php

namespace App\Http\Middleware;

use App\Services\SupportAccessService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Token de acesso de suporte: confere a sessão a cada requisição (encerrada ou expirada corta na hora)
 * e registra as ações que alteram dados.
 */
class TrackSupportAccess
{
    private const READ_METHODS = ['GET', 'HEAD', 'OPTIONS'];

    /** Rotas da própria sessão de suporte (não são alteração de dados da instituição). */
    private const SESSION_PATHS = ['api/support-access/end', 'api/logout'];

    public function __construct(private readonly SupportAccessService $supportAccess)
    {
    }

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $accessId = $user ? $this->supportAccess->accessIdFromToken($user->currentAccessToken()) : null;

        if ($accessId === null) {
            return $next($request);
        }

        $access = $this->supportAccess->activeAccess($accessId, $user);
        if (! $access) {
            $user->currentAccessToken()->delete();

            return response()->json([
                'type' => 'error',
                'message' => 'O acesso de suporte foi encerrado ou expirou.',
                'body' => null,
            ], 401);
        }

        $request->attributes->set('support_access', $access);
        $response = $next($request);

        if (! in_array($request->method(), self::READ_METHODS, true) && ! in_array($request->path(), self::SESSION_PATHS, true)) {
            $this->supportAccess->recordAction($access, $request->method(), '/' . ltrim($request->path(), '/'), $response->getStatusCode());
        }

        return $response;
    }
}

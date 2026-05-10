<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AddApiVersionHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if (! $request->is('api/*')) {
            return $response;
        }

        $apiVersion = (string) config('api_meta.version', '1.0.0');
        $contractVersion = (string) config('api_meta.contract_version', date('Y-m-d'));
        $minAppVersion = (string) config('api_meta.min_supported_app_version', '1.0.0');
        $recommendedAppVersion = (string) config('api_meta.recommended_app_version', $minAppVersion);

        $response->headers->set('X-API-Version', $apiVersion);
        $response->headers->set('X-API-Contract-Version', $contractVersion);
        $response->headers->set('X-Min-Supported-App-Version', $minAppVersion);
        $response->headers->set('X-Recommended-App-Version', $recommendedAppVersion);

        return $response;
    }
}

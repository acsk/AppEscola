<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use OpenApi\Attributes as OA;
use App\Http\Requests\StoreTenantApiTokenRequest;
use App\Http\Resources\TenantApiTokenResource;
use App\Models\TenantApiToken;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Str;

class TenantApiTokenController extends Controller
{
    use ScopedByTenant;

    #[OA\Get(
        path: '/api/tenant-api-tokens',
        tags: ['TenantApiTokens'],
        summary: 'Listar tokens de API do tenant',
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'status', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Lista paginada de tokens'),
            new OA\Response(response: 401, description: 'Não autenticado'),
        ]
    )]
    public function index(Request $request): AnonymousResourceCollection
    {
        $query = TenantApiToken::query();
        $this->applyTenantScope($query, $request);

        $query->when($request->query('status'), fn ($q, $v) => $q->where('status', $v));

        return TenantApiTokenResource::collection($query->latest()->paginate(20));
    }

    #[OA\Post(
        path: '/api/tenant-api-tokens',
        tags: ['TenantApiTokens'],
        summary: 'Criar token de API',
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(
            required: true,
            content: new OA\JsonContent(
                required: ['name'],
                properties: [
                    new OA\Property(property: 'name', type: 'string', example: 'App Mobile'),
                    new OA\Property(property: 'abilities', type: 'array', items: new OA\Items(type: 'string')),
                    new OA\Property(property: 'expires_at', type: 'string', format: 'date-time'),
                ]
            )
        ),
        responses: [
            new OA\Response(response: 201, description: 'Token criado — plain_token exposto apenas aqui'),
            new OA\Response(response: 422, description: 'Tenant não identificado'),
        ]
    )]
    public function store(StoreTenantApiTokenRequest $request): JsonResponse
    {
        $tenantId = $this->getTenantId($request);

        if (! $tenantId) {
            return response()->json(['message' => 'Tenant não identificado.'], 422);
        }

        // Gera token aleatório seguro e salva apenas o hash
        $plainToken = Str::random(64);
        $tokenHash = hash('sha256', $plainToken);

        $token = TenantApiToken::create([
            'tenant_id' => $tenantId,
            'name' => $request->input('name'),
            'token_hash' => $tokenHash,
            'abilities' => $request->input('abilities'),
            'expires_at' => $request->input('expires_at'),
            'status' => 'active',
        ]);

        // Expõe o plain token apenas neste momento
        $resource = new TenantApiTokenResource($token);
        $resource->additional(['plain_token' => $plainToken]);

        return response()->json($resource, 201);
    }

    #[OA\Delete(
        path: '/api/tenant-api-tokens/{id}',
        tags: ['TenantApiTokens'],
        summary: 'Revogar token de API',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Token revogado'),
            new OA\Response(response: 403, description: 'Acesso negado'),
        ]
    )]
    public function destroy(Request $request, TenantApiToken $tenantApiToken): JsonResponse
    {
        $tenantId = $this->getTenantId($request);

        if ($tenantId !== null && $tenantId !== $tenantApiToken->tenant_id) {
            abort(403, 'Acesso negado.');
        }

        $tenantApiToken->delete();

        return response()->json(['message' => 'Token revogado com sucesso.']);
    }
}

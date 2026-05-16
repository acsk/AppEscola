<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePaymentProviderRequest;
use App\Http\Requests\UpdatePaymentProviderRequest;
use App\Http\Resources\PaymentProviderResource;
use App\Models\PaymentProvider;
use App\Models\Tenant;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class PaymentProvidersController extends Controller
{
    use ScopedByTenant;

    private function ensureCanManageTenant(Request $request, Tenant $tenant): void
    {
        $user = $request->user();

        if (! $user || ! in_array($user->role, ['super_admin', 'admin'], true)) {
            throw new AccessDeniedHttpException('Acesso permitido apenas para admin ou super admin.');
        }

        if ($user->isSuperAdmin()) {
            return;
        }

        if ((int) $user->tenant_id !== (int) $tenant->id) {
            throw new AccessDeniedHttpException('Admin só pode acessar provedores do próprio tenant.');
        }
    }

    #[OA\Get(
        path: '/api/payment-providers',
        tags: ['Payment Providers'],
        summary: 'Listar provedores de pagamento',
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'is_active', in: 'query', required: false, schema: new OA\Schema(type: 'boolean')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Lista paginada de provedores'),
            new OA\Response(response: 401, description: 'Não autenticado'),
        ]
    )]
    public function index(Request $request): AnonymousResourceCollection
    {
        $query = PaymentProvider::query()->with('tenant');
        $this->applyTenantScope($query, $request);

        $query->when(
            $request->query('is_active') !== null,
            fn ($q) => $q->where('is_active', filter_var($request->query('is_active'), FILTER_VALIDATE_BOOLEAN))
        );

        return PaymentProviderResource::collection($query->orderBy('order')->paginate(50));
    }

    #[OA\Post(
        path: '/api/payment-providers',
        tags: ['Payment Providers'],
        summary: 'Criar provedor de pagamento',
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(description: 'Dados do provedor')),
        responses: [
            new OA\Response(response: 201, description: 'Provedor criado'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function store(StorePaymentProviderRequest $request): JsonResponse
    {
        $tenantId = $this->getTenantId($request);

        $provider = PaymentProvider::create(array_merge($request->validated(), ['tenant_id' => $tenantId]));

        return $this->created(
            new PaymentProviderResource($provider),
            'Provedor de pagamento criado com sucesso.'
        );
    }

    #[OA\Get(
        path: '/api/payment-providers/{id}',
        tags: ['Payment Providers'],
        summary: 'Exibir provedor de pagamento',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Dados do provedor'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function show(Request $request, PaymentProvider $paymentProvider): JsonResponse
    {
        $this->ensureCanManageTenant($request, $paymentProvider->tenant);
        $paymentProvider->loadMissing('tenant');

        return $this->success(
            new PaymentProviderResource($paymentProvider),
            'Provedor de pagamento recuperado com sucesso.'
        );
    }

    #[OA\Put(
        path: '/api/payment-providers/{id}',
        tags: ['Payment Providers'],
        summary: 'Atualizar provedor de pagamento',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(description: 'Campos a atualizar')),
        responses: [
            new OA\Response(response: 200, description: 'Provedor atualizado'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function update(UpdatePaymentProviderRequest $request, PaymentProvider $paymentProvider): JsonResponse
    {
        $this->ensureCanManageTenant($request, $paymentProvider->tenant);

        $paymentProvider->update($request->validated());

        return $this->success(
            new PaymentProviderResource($paymentProvider),
            'Provedor de pagamento atualizado com sucesso.'
        );
    }

    #[OA\Delete(
        path: '/api/payment-providers/{id}',
        tags: ['Payment Providers'],
        summary: 'Remover provedor de pagamento',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Removido com sucesso'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function destroy(Request $request, PaymentProvider $paymentProvider): JsonResponse
    {
        $this->ensureCanManageTenant($request, $paymentProvider->tenant);

        $paymentProvider->delete();

        return $this->deleted('Provedor de pagamento removido com sucesso.');
    }
}

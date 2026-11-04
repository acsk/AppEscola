<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use OpenApi\Attributes as OA;
use App\Http\Requests\MarkInvoicePaidRequest;
use App\Http\Requests\StoreInvoiceRequest;
use App\Http\Requests\UpdateInvoiceRequest;
use App\Http\Resources\InvoiceResource;
use App\Models\Invoice;
use App\Services\InvoiceLifecycleService;
use App\Services\InvoiceListQuery;
use App\Services\InvoiceSettlementService;
use App\Services\PaymentGatewayFactory;
use App\Support\BusinessDate;
use App\Support\FinancePermissions;
use App\Traits\ScopedByTenant;
use Illuminate\Routing\Controllers\HasMiddleware;
use Illuminate\Routing\Controllers\Middleware;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use RuntimeException;

class InvoiceController extends Controller implements HasMiddleware
{
    use ScopedByTenant;

    /**
     * Roda antes dos Form Requests: papel sem permissão recebe 403, não 422.
     */
    public static function middleware(): array
    {
        return [
            new Middleware(self::requireAbility(FinancePermissions::VIEW), only: ['index', 'summary', 'situations', 'show']),
            new Middleware(self::requireAbility(FinancePermissions::MANAGE_INVOICES), only: ['store', 'update', 'destroy', 'cancel', 'generateCoraCharge']),
            new Middleware(self::requireAbility(FinancePermissions::SETTLE), only: ['markAsPaid']),
        ];
    }

    private static function requireAbility(string $ability): \Closure
    {
        return function (Request $request, \Closure $next) use ($ability) {
            if (! FinancePermissions::allows($request->user(), $ability)) {
                abort(403, 'Sem permissão para acessar o financeiro.');
            }

            return $next($request);
        };
    }

    public function __construct(
        private readonly InvoiceLifecycleService $lifecycle,
        private readonly InvoiceSettlementService $settlement,
        private readonly InvoiceListQuery $listQuery,
    ) {
    }

    #[OA\Get(
        path: '/api/invoices',
        tags: ['Invoices'],
        summary: 'Listar cobranças',
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'status', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'student_id', in: 'query', required: false, schema: new OA\Schema(type: 'integer')),
            new OA\Parameter(name: 'enrollment_id', in: 'query', required: false, schema: new OA\Schema(type: 'integer')),
            new OA\Parameter(name: 'due_date_from', in: 'query', required: false, schema: new OA\Schema(type: 'string', format: 'date')),
            new OA\Parameter(name: 'due_date_to', in: 'query', required: false, schema: new OA\Schema(type: 'string', format: 'date')),
            new OA\Parameter(name: 'paid_at_from', in: 'query', required: false, schema: new OA\Schema(type: 'string', format: 'date')),
            new OA\Parameter(name: 'paid_at_to', in: 'query', required: false, schema: new OA\Schema(type: 'string', format: 'date')),
            new OA\Parameter(name: 'payment_method', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'view', in: 'query', required: false, schema: new OA\Schema(type: 'string', enum: ['open', 'paid', 'all'])),
            new OA\Parameter(name: 'search', in: 'query', required: false, schema: new OA\Schema(type: 'string')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Lista paginada de cobranças'),
            new OA\Response(response: 401, description: 'Não autenticado'),
        ]
    )]
    public function index(Request $request): AnonymousResourceCollection
    {
        $request->validate([
            'situation' => ['nullable', 'in:' . implode(',', InvoiceListQuery::SITUATIONS)],
            'order' => ['nullable', 'in:asc,desc'],
        ]);

        $query = Invoice::query()->with([
            'student',
            'guardian',
            'enrollment.schoolClass.course',
            'enrollment.coursePlan.course',
        ]);
        $this->applyTenantScope($query, $request);
        $query->excludingImportedFromCoraSync();

        $view = $request->query('view', 'all');

        if ($view === 'open') {
            $query->whereIn('status', ['pending', 'overdue']);
        } elseif ($view === 'paid') {
            $query->where('status', 'paid');
        }

        if ($situation = $request->query('situation')) {
            $this->listQuery->applySituation($query, $situation);
        }

        $query->when($request->query('status'), fn ($q, $v) => $q->where('status', $v));
        $this->listQuery->applyFilters($query, $request);

        $orderColumn = $view === 'paid' || $request->query('situation') === 'paid' ? 'paid_at' : 'due_date';
        $direction = $request->query('order', 'desc');

        return InvoiceResource::collection(
            $query->orderBy($orderColumn, $direction)->orderBy('id', $direction)->paginate((int) $request->query('per_page', 20))
        );
    }

    /**
     * Contagem e valor por situação (em aberto, vencidas, a vencer em 7 dias, pagas, canceladas)
     * com os mesmos filtros da listagem, exceto a própria situação.
     */
    public function situations(Request $request): JsonResponse
    {
        $query = Invoice::query();
        $this->applyTenantScope($query, $request);
        $query->excludingImportedFromCoraSync();
        $this->listQuery->applyFilters($query, $request);

        return $this->success([
            'situations' => $this->listQuery->situationTotals($query),
            'due_soon_days' => InvoiceListQuery::DUE_SOON_DAYS,
            'today' => BusinessDate::today()->toDateString(),
        ], 'Situações carregadas com sucesso.');
    }

    #[OA\Get(
        path: '/api/invoices/summary',
        tags: ['Invoices'],
        summary: 'Resumo financeiro de cobranças',
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'paid_at_from', in: 'query', required: false, schema: new OA\Schema(type: 'string', format: 'date')),
            new OA\Parameter(name: 'paid_at_to', in: 'query', required: false, schema: new OA\Schema(type: 'string', format: 'date')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Totais de cobranças em aberto, vencidas e baixadas no período'),
        ]
    )]
    public function summary(Request $request): JsonResponse
    {
        $query = Invoice::query();
        $this->applyTenantScope($query, $request);
        $query->excludingImportedFromCoraSync();

        return response()->json(
            $this->settlement->summary(
                $query,
                $request->query('paid_at_from'),
                $request->query('paid_at_to'),
            )
        );
    }

    #[OA\Post(
        path: '/api/invoices',
        tags: ['Invoices'],
        summary: 'Criar cobrança',
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(description: 'Dados da cobrança')),
        responses: [
            new OA\Response(response: 201, description: 'Cobrança criada'),
            new OA\Response(response: 422, description: 'Dados inválidos'),
        ]
    )]
    public function store(StoreInvoiceRequest $request): JsonResponse
    {
        $tenantId = $this->getTenantId($request);

        $invoice = Invoice::create(array_merge($request->validated(), ['tenant_id' => $tenantId]));
        $invoice->load(['student', 'guardian']);

        return response()->json(new InvoiceResource($invoice), 201);
    }

    #[OA\Get(
        path: '/api/invoices/{id}',
        tags: ['Invoices'],
        summary: 'Exibir cobrança',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Dados da cobrança'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function show(Request $request, Invoice $invoice): JsonResponse
    {
        $this->authorizeTenant($request, $invoice->tenant_id);

        $invoice->load(['student', 'guardian', 'enrollment', 'createdByUser', 'updatedByUser']);

        return response()->json(new InvoiceResource($invoice));
    }

    #[OA\Put(
        path: '/api/invoices/{id}',
        tags: ['Invoices'],
        summary: 'Atualizar cobrança',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(description: 'Campos a atualizar')),
        responses: [
            new OA\Response(response: 200, description: 'Cobrança atualizada'),
            new OA\Response(response: 422, description: 'Não editável (paga, cancelada ou com boleto/PIX gerado)'),
        ]
    )]
    public function update(UpdateInvoiceRequest $request, Invoice $invoice): JsonResponse
    {
        $this->authorizeTenant($request, $invoice->tenant_id);

        try {
            $this->lifecycle->assertCanEdit($invoice);
        } catch (RuntimeException $e) {
            return $this->error($e->getMessage(), $this->lifecycle->permissions($invoice), 422);
        }

        $data = $request->validated();

        // Se o status for alterado para 'paid' e paid_at não foi informado, preenche com a data atual
        if (isset($data['status']) && $data['status'] === 'paid' && empty($data['paid_at'])) {
            $data['paid_at'] = now();
        }

        $invoice->update($data);
        $invoice->load(['student', 'guardian', 'createdByUser', 'updatedByUser']);

        return response()->json(new InvoiceResource($invoice));
    }

    #[OA\Delete(
        path: '/api/invoices/{id}',
        tags: ['Invoices'],
        summary: 'Excluir cobrança criada no sistema',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Removido com sucesso'),
            new OA\Response(response: 404, description: 'Não encontrado'),
        ]
    )]
    public function destroy(Request $request, Invoice $invoice): JsonResponse
    {
        $this->authorizeTenant($request, $invoice->tenant_id);

        try {
            $this->lifecycle->assertCanDelete($invoice);
        } catch (RuntimeException $e) {
            return $this->error($e->getMessage(), $this->lifecycle->permissions($invoice), 422);
        }

        $invoice->delete();

        return $this->deleted('Cobrança removida com sucesso.');
    }

    #[OA\Post(
        path: '/api/invoices/{id}/mark-as-paid',
        tags: ['Invoices'],
        summary: 'Marcar cobrança como paga',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        requestBody: new OA\RequestBody(
            required: false,
            content: new OA\JsonContent(
                properties: [
                    new OA\Property(property: 'paid_at', type: 'string', format: 'date-time', example: '2026-04-28 10:00:00'),
                    new OA\Property(property: 'payment_method', type: 'string', example: 'cash'),
                    new OA\Property(property: 'payment_reference', type: 'string', description: 'Obrigatório para cartão de crédito (NSU, autorização, etc.)'),
                    new OA\Property(property: 'notes', type: 'string'),
                ]
            )
        ),
        responses: [
            new OA\Response(response: 200, description: 'Cobrança marcada como paga'),
            new OA\Response(response: 422, description: 'Cobrança já paga ou cancelada'),
        ]
    )]
    public function markAsPaid(MarkInvoicePaidRequest $request, Invoice $invoice): JsonResponse
    {
        $this->authorizeTenant($request, $invoice->tenant_id);

        try {
            $result = $this->settlement->settle($invoice, $request->validated(), $request);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $invoice = $result['invoice'];
        $invoice->load(['student', 'guardian', 'updatedByUser']);

        return $this->success([
            'invoice' => new InvoiceResource($invoice),
            'cancelled_on_gateway' => $result['cancelled_on_gateway'],
        ], $result['cancelled_on_gateway']
            ? 'Baixa registrada. Cobrança no provedor foi cancelada.'
            : 'Baixa registrada com sucesso.');
    }

    #[OA\Post(
        path: '/api/invoices/{id}/cancel',
        tags: ['Invoices'],
        summary: 'Cancelar cobrança',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Cobrança cancelada'),
            new OA\Response(response: 422, description: 'Já cancelada ou paga'),
        ]
    )]
    public function cancel(Request $request, Invoice $invoice): JsonResponse
    {
        $this->authorizeTenant($request, $invoice->tenant_id);

        try {
            $result = $this->lifecycle->cancelInvoice($invoice, $request);
        } catch (RuntimeException $e) {
            $invoice->refresh();

            return $this->error($e->getMessage(), $this->lifecycle->permissions($invoice), 422);
        } catch (ConnectionException $e) {
            return $this->error(
                'Não foi possível conectar ao provedor para cancelar a cobrança. Tente novamente.',
                ['detail' => $e->getMessage()],
                502
            );
        } catch (RequestException $e) {
            $invoice->loadMissing('tenant');
            $tenant = $invoice->tenant;
            $chargeId = (string) ($invoice->cora_charge_id ?? '');
            $environment = $this->lifecycle->resolveCoraEnvironment($request, $invoice);

            $message = ($tenant instanceof \App\Models\Tenant && $chargeId !== '')
                ? $this->lifecycle->buildGatewayCancelRefusalMessage(
                    $e,
                    $invoice,
                    $tenant,
                    $chargeId,
                    $environment
                )
                : 'O provedor recusou o cancelamento da cobrança.';

            return $this->error(
                $message,
                [
                    'http_status' => $e->response?->status(),
                    'detail' => $e->response?->json(),
                    'permissions' => $this->lifecycle->permissions($invoice->fresh()),
                ],
                422
            );
        }

        $invoice->refresh();

        $message = $result['cancelled_on_gateway']
            ? 'Cobrança cancelada no provedor e no sistema.'
            : 'Cobrança cancelada no sistema.';

        return $this->success([
            'invoice' => new InvoiceResource($invoice),
            'cancelled_on_gateway' => $result['cancelled_on_gateway'],
            'environment' => $result['environment'],
        ], $message);
    }

    #[OA\Post(
        path: '/api/invoices/{id}/generate-cora-charge',
        tags: ['Invoices'],
        summary: 'Gerar cobrança na Cora para a fatura',
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Cobrança da Cora gerada com sucesso'),
            new OA\Response(response: 422, description: 'Fatura não elegível para cobrança'),
            new OA\Response(response: 502, description: 'Falha de comunicação com Cora'),
        ]
    )]
    public function generateCoraCharge(Request $request, Invoice $invoice, PaymentGatewayFactory $factory): JsonResponse
    {
        $this->authorizeTenant($request, $invoice->tenant_id);

        if (in_array($invoice->status, ['paid', 'cancelled'], true)) {
            return response()->json([
                'message' => 'Não é possível gerar cobrança Cora para fatura paga ou cancelada.',
            ], 422);
        }

        $invoice->loadMissing(['student', 'guardian']);

        try {
            $result = $factory->resolve('cora')->createCharge($invoice);
        } catch (ConnectionException|RequestException $e) {
            return response()->json([
                'message' => 'Erro ao comunicar com Cora.',
                'error' => $e->getMessage(),
            ], 502);
        } catch (\RuntimeException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], 422);
        }

        $invoice->update([
            'payment_method' => $invoice->payment_method ?? 'pix',
            'cora_charge_id' => $result['external_id'],
            'cora_status' => $result['status'],
            'cora_payment_url' => $result['payment_url'],
            'cora_pix_copy_paste' => $result['pix_copy_paste'],
            'boleto_number' => $result['boleto_number'],
            'boleto_digitable' => $result['boleto_digitable'],
            'cora_payload' => $result['payload'],
            'cora_last_synced_at' => now(),
        ]);

        $invoice->refresh()->load(['student', 'guardian']);

        return response()->json([
            'type' => 'success',
            'message' => 'Cobrança Cora gerada com sucesso.',
            'body' => new InvoiceResource($invoice),
        ]);
    }

    private function authorizeTenant(Request $request, int $resourceTenantId): void
    {
        $tenantId = $this->getTenantId($request);

        if ($tenantId !== null && $tenantId !== $resourceTenantId) {
            abort(403, 'Acesso negado.');
        }
    }
}

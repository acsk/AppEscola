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
use App\Services\InvoiceSettlementService;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use RuntimeException;

class InvoiceController extends Controller
{
    use ScopedByTenant;

    public function __construct(
        private readonly InvoiceLifecycleService $lifecycle,
        private readonly InvoiceSettlementService $settlement,
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
        $query = Invoice::query()->with(['student', 'guardian']);
        $this->applyTenantScope($query, $request);

        $view = $request->query('view', 'all');

        if ($view === 'open') {
            $query->whereIn('status', ['pending', 'overdue']);
        } elseif ($view === 'paid') {
            $query->where('status', 'paid');
        }

        $query
            ->when($request->query('status'), fn ($q, $v) => $q->where('status', $v))
            ->when($request->query('student_id'), fn ($q, $v) => $q->where('student_id', $v))
            ->when($request->query('enrollment_id'), fn ($q, $v) => $q->where('enrollment_id', $v))
            ->when($request->query('payment_method'), fn ($q, $v) => $q->where('payment_method', $v))
            ->when($request->query('due_date_from'), fn ($q, $v) => $q->whereDate('due_date', '>=', $v))
            ->when($request->query('due_date_to'), fn ($q, $v) => $q->whereDate('due_date', '<=', $v))
            ->when($request->query('paid_at_from'), fn ($q, $v) => $q->whereDate('paid_at', '>=', $v))
            ->when($request->query('paid_at_to'), fn ($q, $v) => $q->whereDate('paid_at', '<=', $v))
            ->when($request->query('search'), function ($q, $v) {
                $term = '%' . trim((string) $v) . '%';
                $q->where(function ($inner) use ($term) {
                    $inner->where('description', 'like', $term)
                        ->orWhereHas('student', fn ($s) => $s->where('name', 'like', $term));
                });
            });

        $orderColumn = $view === 'paid' ? 'paid_at' : 'due_date';

        return InvoiceResource::collection(
            $query->orderByDesc($orderColumn)->paginate((int) $request->query('per_page', 20))
        );
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
        summary: 'Remover cobrança',
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
            return $this->error($e->getMessage(), $this->lifecycle->permissions($invoice), 422);
        } catch (ConnectionException $e) {
            return $this->error(
                'Não foi possível conectar ao provedor para cancelar a cobrança. Tente novamente.',
                ['detail' => $e->getMessage()],
                502
            );
        } catch (RequestException $e) {
            return $this->error(
                'O provedor recusou o cancelamento da cobrança.',
                [
                    'http_status' => $e->response?->status(),
                    'detail' => $e->response?->json(),
                ],
                502
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

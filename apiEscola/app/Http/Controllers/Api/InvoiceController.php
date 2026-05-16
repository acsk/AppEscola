<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use OpenApi\Attributes as OA;
use App\Http\Requests\MarkInvoicePaidRequest;
use App\Http\Requests\StoreInvoiceRequest;
use App\Http\Requests\UpdateInvoiceRequest;
use App\Http\Resources\InvoiceResource;
use App\Models\Invoice;
use App\Services\PaymentGatewayFactory;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;

class InvoiceController extends Controller
{
    use ScopedByTenant;

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

        $query
            ->when($request->query('status'), fn ($q, $v) => $q->where('status', $v))
            ->when($request->query('student_id'), fn ($q, $v) => $q->where('student_id', $v))
            ->when($request->query('enrollment_id'), fn ($q, $v) => $q->where('enrollment_id', $v))
            ->when($request->query('due_date_from'), fn ($q, $v) => $q->whereDate('due_date', '>=', $v))
            ->when($request->query('due_date_to'), fn ($q, $v) => $q->whereDate('due_date', '<=', $v));

        return InvoiceResource::collection($query->orderBy('due_date')->paginate(20));
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
            new OA\Response(response: 422, description: 'Não editável (paga ou cancelada)'),
        ]
    )]
    public function update(UpdateInvoiceRequest $request, Invoice $invoice): JsonResponse
    {
        $this->authorizeTenant($request, $invoice->tenant_id);

        if (in_array($invoice->status, ['paid', 'cancelled'])) {
            return $this->error('Não é possível editar uma cobrança paga ou cancelada.', null, 422);
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

        if ($invoice->status === 'paid') {
            return $this->error('Não é possível excluir uma cobrança paga.', null, 422);
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
                    new OA\Property(property: 'payment_method', type: 'string', example: 'pix'),
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

        if ($invoice->status === 'paid') {
            return response()->json(['message' => 'Cobrança já está paga.'], 422);
        }

        if ($invoice->status === 'cancelled') {
            return response()->json(['message' => 'Não é possível marcar uma cobrança cancelada como paga.'], 422);
        }

        $invoice->update([
            'status' => 'paid',
            'paid_at' => $request->input('paid_at') ?? now(),
            'payment_method' => $request->input('payment_method'),
            'notes' => $request->input('notes', $invoice->notes),
        ]);

        return response()->json(new InvoiceResource($invoice));
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
    public function cancel(Request $request, Invoice $invoice, PaymentGatewayFactory $factory): JsonResponse
    {
        $this->authorizeTenant($request, $invoice->tenant_id);

        if ($invoice->status === 'cancelled') {
            return $this->error('Cobrança já está cancelada.', null, 422);
        }

        if ($invoice->status === 'paid') {
            return $this->error('Não é possível cancelar uma cobrança paga.', null, 422);
        }

        // PIX com cobrança ativa no Cora expira automaticamente — não cancelar manualmente.
        $isPixWithActiveCharge = $invoice->cora_charge_id
            && in_array($invoice->payment_method, ['pix'], true)
            && in_array($invoice->cora_status, ['OPEN', 'PENDING', null], true);

        if ($isPixWithActiveCharge) {
            return $this->error(
                'Cobranças PIX expiram automaticamente. Não é necessário cancelar manualmente.',
                ['cora_charge_id' => $invoice->cora_charge_id],
                422
            );
        }

        // Se há cobrança ativa no Cora (boleto), cancela lá também.
        if ($invoice->cora_charge_id) {
            $invoice->loadMissing('tenant');
            $environment = $request->input('environment', 'prod');

            try {
                $factory->resolve('cora')->cancelCharge($invoice->tenant, $invoice->cora_charge_id, $environment);
            } catch (\Illuminate\Http\Client\ConnectionException $e) {
                return $this->error(
                    'Não foi possível conectar à Cora para cancelar a cobrança. Tente novamente.',
                    ['detail' => $e->getMessage()],
                    502
                );
            } catch (\Illuminate\Http\Client\RequestException $e) {
                return $this->error(
                    'A Cora recusou o cancelamento da cobrança.',
                    [
                        'http_status' => $e->response?->status(),
                        'detail'      => $e->response?->json(),
                    ],
                    502
                );
            }
        }

        $invoice->update(['status' => 'cancelled']);

        return $this->success(new InvoiceResource($invoice), 'Cobrança cancelada com sucesso.');
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

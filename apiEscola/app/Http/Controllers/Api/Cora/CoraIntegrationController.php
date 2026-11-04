<?php

namespace App\Http\Controllers\Api\Cora;

use App\Http\Controllers\Controller;
use App\Models\CoraWebhookEvent;
use App\Models\Invoice;
use App\Services\Cora\CoraIntegrationOverview;
use App\Services\Cora\CoraPaidInvoicesSyncService;
use App\Services\Cora\CoraWebhookProcessor;
use App\Support\FinancePermissions;
use App\Traits\ScopedByTenant;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use RuntimeException;

/**
 * Financeiro > Integração Cora: situação da integração, avisos do webhook e ações manuais.
 * Tenant e permissão sempre validados aqui; nenhum segredo (token, certificado, chave da URL) sai.
 */
class CoraIntegrationController extends Controller
{
    use ScopedByTenant;

    public function __construct(
        private readonly CoraIntegrationOverview $overview,
        private readonly CoraWebhookProcessor $processor,
        private readonly CoraPaidInvoicesSyncService $sync,
    ) {
    }

    public function show(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeTenant($request, FinancePermissions::VIEW);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $body = $this->overview->build($tenantId);
        $body['permissions'] = FinancePermissions::forUser($request->user());

        return $this->success($body, 'Situação da integração Cora carregada com sucesso.');
    }

    public function events(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeTenant($request, FinancePermissions::VIEW);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $filters = $request->validate([
            'stage' => ['nullable', Rule::in(CoraIntegrationOverview::STAGES)],
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'search' => ['nullable', 'string', 'max:100'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $page = $this->overview->events($tenantId, $filters);

        return $this->success([
            'items' => collect($page->items())->map(fn ($e) => CoraIntegrationOverview::present($e))->all(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ], 'Avisos da Cora carregados com sucesso.');
    }

    public function retry(Request $request, int $event): JsonResponse
    {
        $tenantId = $this->authorizeTenant($request, FinancePermissions::SETTLE);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $model = CoraWebhookEvent::query()->where('tenant_id', $tenantId)->find($event);
        if (! $model) {
            return $this->error('Aviso não encontrado.', null, 404);
        }

        if ($this->processor->retry($model, $request->user()?->id) === null) {
            return $this->validationError(
                ['event' => ['Só avisos com falha ou em revisão podem ser reprocessados.']],
                'Só avisos com falha ou em revisão podem ser reprocessados.'
            );
        }

        $model->refresh()->load(['invoice.student:id,name', 'retriedBy:id,name']);

        return $this->success(CoraIntegrationOverview::present($model), 'Aviso reprocessado.');
    }

    /**
     * Consulta a cobrança na Cora e aplica a situação com as mesmas regras do webhook:
     * só baixa o que a Cora confirma, nunca reabre título pago.
     */
    public function consultInvoice(Request $request, int $invoice): JsonResponse
    {
        $tenantId = $this->authorizeTenant($request, FinancePermissions::SETTLE);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $model = Invoice::query()->with('tenant')->where('tenant_id', $tenantId)->find($invoice);
        if (! $model) {
            return $this->error('Cobrança não encontrada.', null, 404);
        }
        if (trim((string) $model->cora_charge_id) === '') {
            return $this->validationError(
                ['invoice' => ['Esta cobrança não foi emitida pela Cora.']],
                'Esta cobrança não foi emitida pela Cora.'
            );
        }

        // Mesmo critério do charge-status: fora de produção sempre stage.
        $environment = app()->environment('production')
            ? $this->sync->resolveEnvironment($model, 'prod')
            : 'stage';

        try {
            $outcome = $this->sync->syncOne($model, $environment, 'cora:manual');
        } catch (ConnectionException|RequestException $e) {
            Log::warning('Integração Cora: falha ao consultar cobrança.', [
                'invoice_id' => $model->id,
                'tenant_id' => $tenantId,
                'environment' => $environment,
                'error' => $e->getMessage(),
            ]);

            return $this->error('Não foi possível consultar a Cora agora. Tente novamente em instantes.', null, 502);
        } catch (RuntimeException $e) {
            return $this->error($e->getMessage(), null, 422);
        }

        $model->refresh();

        return $this->success([
            'outcome' => $outcome,
            'environment' => $environment,
            'invoice' => [
                'id' => $model->id,
                'status' => $model->status,
                'paid_at' => $model->paid_at?->toISOString(),
                'cora_status' => $model->cora_status,
                'cora_last_synced_at' => $model->cora_last_synced_at?->toISOString(),
            ],
        ], match ($outcome) {
            'paid' => 'Pagamento confirmado pela Cora e baixa aplicada.',
            'cancelled' => 'Cancelamento confirmado pela Cora.',
            default => 'Consulta feita: nenhuma mudança na cobrança.',
        });
    }

    private function authorizeTenant(Request $request, string $ability): int|JsonResponse
    {
        if (! FinancePermissions::allows($request->user(), $ability)) {
            return $this->forbidden('Sem permissão para esta ação do financeiro.');
        }

        $tenantId = $this->getTenantId($request);
        if ($tenantId === null) {
            return $this->validationError(
                ['tenant_id' => ['Selecione uma instituição.']],
                'Selecione uma instituição para ver a integração Cora.'
            );
        }

        return $tenantId;
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BankStatementEntry;
use App\Models\BankStatementEntryLog;
use App\Models\Invoice;
use App\Models\Tenant;
use App\Services\Cora\CoraBankStatementSyncService;
use App\Services\Reconciliation\BankReconciliationQuery;
use App\Services\Reconciliation\BankReconciliationService;
use App\Support\BusinessDate;
use App\Support\FinancePermissions;
use App\Traits\ScopedByTenant;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use RuntimeException;

/**
 * Financeiro > Conciliação bancária. Leitura com finance.view; sincronizar e decidir com
 * finance.invoices.settle. Nenhuma ação movimenta a conta bancária.
 */
class BankReconciliationController extends Controller
{
    use ScopedByTenant;

    public function __construct(
        private readonly BankReconciliationQuery $query,
        private readonly BankReconciliationService $reconciliation,
        private readonly CoraBankStatementSyncService $statementSync,
    ) {
    }

    public function summary(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeTenant($request, FinancePermissions::VIEW);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $body = $this->query->summary($tenantId, $this->environment(), $this->validateFilters($request));
        $body['permissions'] = FinancePermissions::forUser($request->user());

        return $this->success($body, 'Resumo da conciliação carregado com sucesso.');
    }

    public function entries(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeTenant($request, FinancePermissions::VIEW);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $filters = $this->validateFilters($request) + $request->validate([
            'status' => ['nullable', Rule::in(BankReconciliationService::STATUSES)],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $page = $this->query->entries($tenantId, $this->environment(), $filters);

        return $this->success([
            'items' => collect($page->items())->map(fn ($e) => BankReconciliationQuery::present($e))->all(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ], 'Movimentações carregadas com sucesso.');
    }

    public function candidates(Request $request, int $entry): JsonResponse
    {
        $tenantId = $this->authorizeTenant($request, FinancePermissions::VIEW);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $model = $this->findEntry($tenantId, $entry);
        if (! $model) {
            return $this->error('Movimentação não encontrada.', null, 404);
        }

        $search = $request->validate(['search' => ['nullable', 'string', 'max:100']])['search'] ?? null;

        return $this->success([
            'items' => $model->direction === 'credit' ? $this->query->candidates($model, $search) : [],
        ], 'Cobranças candidatas carregadas com sucesso.');
    }

    public function history(Request $request, int $entry): JsonResponse
    {
        $tenantId = $this->authorizeTenant($request, FinancePermissions::VIEW);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $model = $this->findEntry($tenantId, $entry);
        if (! $model) {
            return $this->error('Movimentação não encontrada.', null, 404);
        }

        $items = $model->logs()->with('user:id,name')->orderByDesc('id')->limit(50)->get()
            ->map(fn (BankStatementEntryLog $log) => [
                'id' => $log->id,
                'action' => $log->action,
                'from_status' => $log->from_status,
                'to_status' => $log->to_status,
                'invoice_id' => $log->invoice_id,
                'justification' => $log->justification,
                'user' => $log->user ? ['id' => $log->user->id, 'name' => $log->user->name] : null,
                'created_at' => $log->created_at?->toISOString(),
            ]);

        return $this->success(['items' => $items], 'Histórico carregado com sucesso.');
    }

    /** Busca o extrato na Cora (somente leitura) e tenta a conciliação automática do que é novo. */
    public function sync(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeTenant($request, FinancePermissions::SETTLE);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $validated = $request->validate([
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:date_from'],
        ]);

        $to = isset($validated['date_to']) ? Carbon::parse($validated['date_to']) : BusinessDate::today();
        $from = isset($validated['date_from']) ? Carbon::parse($validated['date_from']) : $to->copy()->subDays(6);

        $tenant = Tenant::query()->find($tenantId);
        if (! $tenant) {
            return $this->error('Instituição não encontrada.', null, 404);
        }

        try {
            $run = $this->statementSync->sync($tenant, $this->environment(), $from, $to, $request->user()?->id);
        } catch (ConnectionException|RequestException $e) {
            Log::warning('Conciliação bancária: falha ao buscar extrato.', [
                'tenant_id' => $tenantId,
                'error' => $e->getMessage(),
            ]);

            $status = $e instanceof RequestException ? $e->response->status() : null;
            $message = in_array($status, [401, 403], true)
                ? 'A Cora recusou o acesso ao extrato. Verifique se as credenciais têm permissão de extrato.'
                : 'Não foi possível consultar o extrato na Cora agora. Tente novamente em instantes.';

            return $this->error($message, null, 502);
        } catch (RuntimeException $e) {
            return $this->error($e->getMessage(), null, 422);
        }

        return $this->success([
            'created' => $run->created,
            'auto_reconciled' => $run->auto_reconciled,
            'divergent' => $run->divergent,
            'period_start' => $run->period_start?->toDateString(),
            'period_end' => $run->period_end?->toDateString(),
        ], $run->created > 0
            ? "Extrato sincronizado: {$run->created} movimentação(ões) nova(s), {$run->auto_reconciled} conciliada(s) automaticamente."
            : 'Extrato sincronizado: nenhuma movimentação nova.');
    }

    public function reconcile(Request $request, int $entry): JsonResponse
    {
        $tenantId = $this->authorizeTenant($request, FinancePermissions::SETTLE);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $validated = $request->validate([
            'invoice_id' => ['required', 'integer'],
            'justification' => $this->justificationRules(),
        ]);

        $model = $this->findEntry($tenantId, $entry);
        if (! $model) {
            return $this->error('Movimentação não encontrada.', null, 404);
        }

        $invoice = Invoice::query()->with('tenant')->where('tenant_id', $tenantId)->find($validated['invoice_id']);
        if (! $invoice) {
            return $this->error('Cobrança não encontrada.', null, 404);
        }

        return $this->decide(
            fn () => $this->reconciliation->reconcile($model, $invoice, trim($validated['justification']), $request->user()),
            'Movimentação conciliada.',
        );
    }

    public function ignore(Request $request, int $entry): JsonResponse
    {
        return $this->simpleDecision($request, $entry, 'ignore', 'Movimentação ignorada.');
    }

    public function markDivergent(Request $request, int $entry): JsonResponse
    {
        return $this->simpleDecision($request, $entry, 'markDivergent', 'Movimentação marcada como divergente.');
    }

    public function undo(Request $request, int $entry): JsonResponse
    {
        return $this->simpleDecision($request, $entry, 'undo', 'Movimentação voltou para pendente.');
    }

    private function simpleDecision(Request $request, int $entry, string $method, string $message): JsonResponse
    {
        $tenantId = $this->authorizeTenant($request, FinancePermissions::SETTLE);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $justification = trim($request->validate(['justification' => $this->justificationRules()])['justification']);

        $model = $this->findEntry($tenantId, $entry);
        if (! $model) {
            return $this->error('Movimentação não encontrada.', null, 404);
        }

        return $this->decide(fn () => $this->reconciliation->{$method}($model, $justification, $request->user()), $message);
    }

    /** @param  callable(): BankStatementEntry  $action */
    private function decide(callable $action, string $message): JsonResponse
    {
        try {
            $entry = $action();
        } catch (ConnectionException|RequestException $e) {
            Log::warning('Conciliação bancária: falha ao consultar a Cora.', ['error' => $e->getMessage()]);

            return $this->error('Não foi possível consultar a Cora agora. Nada foi conciliado.', null, 502);
        } catch (RuntimeException $e) {
            return $this->error($e->getMessage(), null, 422);
        }

        $entry->load(['invoice.student:id,name', 'reviewer:id,name']);

        return $this->success(BankReconciliationQuery::present($entry), $message);
    }

    /** @return array<string, mixed> */
    private function validateFilters(Request $request): array
    {
        return $request->validate([
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'direction' => ['nullable', Rule::in(['credit', 'debit'])],
            'origin' => ['nullable', Rule::in(['app', 'other'])],
            'type' => ['nullable', Rule::in(array_keys(BankReconciliationQuery::TYPES))],
            'search' => ['nullable', 'string', 'max:100'],
        ]);
    }

    /** @return array<int, string> */
    private function justificationRules(): array
    {
        return ['required', 'string', 'min:10', 'max:500'];
    }

    /** Mesmo critério da Integração Cora: fora de produção sempre stage. */
    private function environment(): string
    {
        return app()->environment('production') ? 'prod' : 'stage';
    }

    private function findEntry(int $tenantId, int $entry): ?BankStatementEntry
    {
        return BankStatementEntry::query()->where('tenant_id', $tenantId)->find($entry);
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
                'Selecione uma instituição para ver a conciliação bancária.'
            );
        }

        return $tenantId;
    }
}

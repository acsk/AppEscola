<?php

namespace App\Http\Controllers\Api\Payables;

use App\Http\Controllers\Controller;
use App\Models\Expense;
use App\Models\ExpenseAttachment;
use App\Services\Payables\ExpenseQuery;
use App\Services\Payables\ExpenseService;
use App\Services\Payables\PayablesCatalog;
use App\Support\BusinessDate;
use App\Support\FinancePermissions;
use App\Traits\AuthorizesFinance;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use RuntimeException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Financeiro > Contas a pagar. Leitura com finance.view; cadastro, pagamento e comprovantes com
 * finance.payables.manage; aprovação com finance.payables.approve. Nada aqui movimenta a conta bancária.
 */
class ExpenseController extends Controller
{
    use AuthorizesFinance;

    public function __construct(
        private readonly ExpenseService $expenses,
        private readonly ExpenseQuery $query,
        private readonly PayablesCatalog $catalog,
    ) {
    }

    public function summary(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeFinance($request, FinancePermissions::VIEW);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $month = $request->validate(['month' => ['nullable', 'date_format:Y-m']])['month'] ?? null;
        $body = $this->query->summary($tenantId, $month ? Carbon::createFromFormat('Y-m-d', $month . '-01') : BusinessDate::today());
        $body['permissions'] = FinancePermissions::forUser($request->user());

        return $this->success($body, 'Resumo de contas a pagar carregado com sucesso.');
    }

    public function options(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeFinance($request, FinancePermissions::VIEW);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        return $this->success($this->catalog->options($tenantId), 'Opções carregadas com sucesso.');
    }

    public function index(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeFinance($request, FinancePermissions::VIEW);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'category_id' => ['nullable', 'integer'],
            'cost_center_id' => ['nullable', 'integer'],
            'supplier_id' => ['nullable', 'integer'],
            'recurrence' => ['nullable', Rule::in(['recurring', 'one_off'])],
            'situation' => ['nullable', Rule::in(ExpenseQuery::SITUATIONS)],
            'without_receipt' => ['nullable', 'boolean'],
            'due_from' => ['nullable', 'date_format:Y-m-d'],
            'due_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:due_from'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $page = $this->query->list($tenantId, $filters);
        $today = BusinessDate::today();

        return $this->success([
            'items' => collect($page->items())->map(fn ($e) => ExpenseQuery::present($e, $today))->all(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ], 'Despesas carregadas com sucesso.');
    }

    public function show(Request $request, int $expense): JsonResponse
    {
        $tenantId = $this->authorizeFinance($request, FinancePermissions::VIEW);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $model = $this->find($tenantId, $expense);

        return $model
            ? $this->success(ExpenseQuery::detail($model), 'Despesa carregada com sucesso.')
            : $this->error('Despesa não encontrada.', null, 404);
    }

    public function store(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeFinance($request, FinancePermissions::MANAGE_PAYABLES);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $data = $request->validate($this->rules() + ['submit' => ['nullable', 'boolean']]);

        return $this->run(fn () => $this->expenses->create($tenantId, $data, $request->user()), 'Despesa cadastrada.', 201);
    }

    public function update(Request $request, int $expense): JsonResponse
    {
        $tenantId = $this->authorizeFinance($request, FinancePermissions::MANAGE_PAYABLES);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $data = $request->validate($this->rules() + ['reason' => ['nullable', 'string', 'max:500']]);
        $model = $this->find($tenantId, $expense);
        if (! $model) {
            return $this->error('Despesa não encontrada.', null, 404);
        }

        return $this->run(fn () => $this->expenses->update($model, $data, $request->user(), $data['reason'] ?? null), 'Despesa atualizada.');
    }

    public function submit(Request $request, int $expense): JsonResponse
    {
        return $this->act($request, $expense, FinancePermissions::MANAGE_PAYABLES, fn ($m) => $this->expenses->submit($m, $request->user()), 'Despesa enviada para aprovação.');
    }

    public function approve(Request $request, int $expense): JsonResponse
    {
        return $this->act($request, $expense, FinancePermissions::APPROVE_PAYABLES, fn ($m) => $this->expenses->approve($m, $request->user()), 'Despesa aprovada. Nenhum pagamento foi feito no banco.');
    }

    public function pay(Request $request, int $expense): JsonResponse
    {
        $data = $request->validate([
            'paid_at' => ['nullable', 'date'],
            'payment_method' => ['required', Rule::in(Expense::PAYMENT_METHODS)],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        return $this->act($request, $expense, FinancePermissions::MANAGE_PAYABLES, fn ($m) => $this->expenses->pay($m, $data, $request->user()), 'Pagamento registrado. Nenhum valor foi movimentado no banco.');
    }

    public function reopen(Request $request, int $expense): JsonResponse
    {
        $reason = $request->validate(['reason' => ['required', 'string', 'min:10', 'max:500']])['reason'];

        return $this->act($request, $expense, FinancePermissions::MANAGE_PAYABLES, fn ($m) => $this->expenses->reopen($m, $reason, $request->user()), 'Pagamento desfeito; a despesa voltou para aprovada.');
    }

    public function cancel(Request $request, int $expense): JsonResponse
    {
        $reason = $request->validate(['reason' => ['required', 'string', 'min:10', 'max:500']])['reason'];

        return $this->act($request, $expense, FinancePermissions::MANAGE_PAYABLES, fn ($m) => $this->expenses->cancel($m, $reason, $request->user()), 'Despesa cancelada.');
    }

    public function storeAttachment(Request $request, int $expense): JsonResponse
    {
        $tenantId = $this->authorizeFinance($request, FinancePermissions::MANAGE_PAYABLES);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $file = $request->validate(['file' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png,webp', 'max:10240']])['file'];
        $model = $this->find($tenantId, $expense);
        if (! $model) {
            return $this->error('Despesa não encontrada.', null, 404);
        }

        try {
            $this->expenses->addAttachment($model, $file, $request->user());
        } catch (RuntimeException $e) {
            return $this->error($e->getMessage(), null, 422);
        }

        return $this->success(ExpenseQuery::detail($model->fresh()), 'Comprovante anexado.', 201);
    }

    public function downloadAttachment(Request $request, int $expense, int $attachment): JsonResponse|StreamedResponse
    {
        $tenantId = $this->authorizeFinance($request, FinancePermissions::VIEW);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $model = $this->findAttachment($tenantId, $expense, $attachment);
        if (! $model || ! Storage::disk('local')->exists($model->path)) {
            return $this->error('Comprovante não encontrado.', null, 404);
        }

        return Storage::disk('local')->download($model->path, $model->original_name, ['Content-Type' => $model->mime]);
    }

    public function destroyAttachment(Request $request, int $expense, int $attachment): JsonResponse
    {
        $tenantId = $this->authorizeFinance($request, FinancePermissions::MANAGE_PAYABLES);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $reason = $request->validate(['reason' => ['required', 'string', 'min:10', 'max:500']])['reason'];
        $model = $this->findAttachment($tenantId, $expense, $attachment);
        if (! $model) {
            return $this->error('Comprovante não encontrado.', null, 404);
        }

        $parent = Expense::query()->findOrFail($model->expense_id);
        $this->expenses->removeAttachment($model, $parent, $reason);

        return $this->success(ExpenseQuery::detail($parent->fresh()), 'Comprovante removido.');
    }

    /** @return array<string, array<int, mixed>> */
    private function rules(): array
    {
        return [
            'description' => ['required', 'string', 'max:160'],
            'supplier_id' => ['nullable', 'integer'],
            'category_id' => ['nullable', 'integer'],
            'cost_center_id' => ['nullable', 'integer'],
            'amount' => ['required', 'numeric', 'min:0.01', 'max:99999999'],
            'due_date' => ['required', 'date_format:Y-m-d'],
            'recurrence' => ['nullable', Rule::in(['none', 'monthly'])],
            'auto_debit' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }

    /** @param  callable(Expense): Expense  $action */
    private function act(Request $request, int $expense, string $ability, callable $action, string $message): JsonResponse
    {
        $tenantId = $this->authorizeFinance($request, $ability);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $model = $this->find($tenantId, $expense);
        if (! $model) {
            return $this->error('Despesa não encontrada.', null, 404);
        }

        return $this->run(fn () => $action($model), $message);
    }

    /** @param  callable(): Expense  $action */
    private function run(callable $action, string $message, int $status = 200): JsonResponse
    {
        try {
            $expense = $action();
        } catch (RuntimeException $e) {
            return $this->error($e->getMessage(), null, 422);
        }

        return $this->success(ExpenseQuery::detail($expense->fresh()), $message, $status);
    }

    private function find(int $tenantId, int $expense): ?Expense
    {
        return Expense::query()->where('tenant_id', $tenantId)->find($expense);
    }

    private function findAttachment(int $tenantId, int $expense, int $attachment): ?ExpenseAttachment
    {
        return ExpenseAttachment::query()
            ->where('tenant_id', $tenantId)
            ->where('expense_id', $expense)
            ->find($attachment);
    }
}

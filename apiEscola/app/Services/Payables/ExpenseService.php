<?php

namespace App\Services\Payables;

use App\Models\CostCenter;
use App\Models\Expense;
use App\Models\ExpenseAttachment;
use App\Models\FinanceCategory;
use App\Models\Supplier;
use App\Models\User;
use App\Observers\ExpenseAuditObserver;
use App\Support\BusinessDate;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Regras das despesas: Rascunho → Em aprovação → Aprovada → Paga (ou Cancelada antes de paga).
 * Registrar pagamento só atualiza o controle: nenhuma transferência é feita no banco.
 */
class ExpenseService
{
    /** Campos que, mudados numa despesa aprovada, exigem nova aprovação. */
    private const APPROVAL_SENSITIVE = ['amount', 'due_date', 'supplier_id'];

    /** @param  array<string, mixed>  $data */
    public function create(int $tenantId, array $data, User $user): Expense
    {
        $this->assertReferences($tenantId, $data);

        return DB::transaction(function () use ($tenantId, $data, $user) {
            $expense = Expense::query()->create([
                'tenant_id' => $tenantId,
                'description' => trim($data['description']),
                'supplier_id' => $data['supplier_id'] ?? null,
                'category_id' => $data['category_id'] ?? null,
                'cost_center_id' => $data['cost_center_id'] ?? null,
                'amount' => $data['amount'],
                'due_date' => $data['due_date'],
                'status' => ! empty($data['submit']) ? 'pending_approval' : 'draft',
                'recurrence' => $data['recurrence'] ?? 'none',
                'auto_debit' => (bool) ($data['auto_debit'] ?? false),
                'notes' => $data['notes'] ?? null,
                'created_by' => $user->id,
                'updated_by' => $user->id,
            ]);

            if ($expense->recurrence === 'monthly') {
                // A primeira despesa é a raiz da série; as próximas competências vêm da rotina diária.
                $expense->series_id = $expense->id;
                $expense->saveQuietly();
            }

            return $expense;
        });
    }

    /** @param  array<string, mixed>  $data */
    public function update(Expense $expense, array $data, User $user, ?string $reason = null): Expense
    {
        $this->assertEditable($expense);
        $this->assertReferences((int) $expense->tenant_id, $data);

        return ExpenseAuditObserver::withReason($reason, fn () => DB::transaction(function () use ($expense, $data, $user) {
            $locked = $this->lock($expense);
            $this->assertEditable($locked);

            $locked->fill(collect($data)->only([
                'description', 'supplier_id', 'category_id', 'cost_center_id', 'amount', 'due_date', 'recurrence', 'auto_debit', 'notes',
            ])->all());
            $locked->updated_by = $user->id;

            if ($locked->recurrence === 'monthly' && $locked->series_id === null) {
                $locked->series_id = $locked->id;
            }

            if ($locked->status === 'approved' && $locked->isDirty(self::APPROVAL_SENSITIVE)) {
                $locked->status = 'pending_approval';
                $locked->approved_by = null;
                $locked->approved_at = null;
            }

            $locked->save();

            return $locked;
        }));
    }

    public function submit(Expense $expense, User $user): Expense
    {
        return $this->transition($expense, ['draft'], ['status' => 'pending_approval', 'updated_by' => $user->id]);
    }

    public function approve(Expense $expense, User $user): Expense
    {
        return $this->transition($expense, ['draft', 'pending_approval'], [
            'status' => 'approved',
            'approved_by' => $user->id,
            'approved_at' => now(),
            'updated_by' => $user->id,
        ]);
    }

    /**
     * Registra que a despesa foi paga. Não movimenta dinheiro: é o controle de que o pagamento aconteceu.
     *
     * @param  array{paid_at?: ?string, payment_method: string, notes?: ?string}  $data
     */
    public function pay(Expense $expense, array $data, User $user): Expense
    {
        $paidAt = ! empty($data['paid_at']) ? BusinessDate::moment((string) $data['paid_at']) : now();
        if ($paidAt->isAfter(now()->endOfDay())) {
            throw new RuntimeException('A data do pagamento não pode ser futura.');
        }

        $attributes = [
            'status' => 'paid',
            'paid_at' => $paidAt,
            'payment_method' => $data['payment_method'],
            'paid_by' => $user->id,
            'updated_by' => $user->id,
        ];
        if (! empty($data['notes'])) {
            $attributes['notes'] = $data['notes'];
        }

        return $this->transition($expense, ['approved'], $attributes);
    }

    /** Desfaz o registro de pagamento (ex.: lançado por engano). Bloqueado se já está conciliado no extrato. */
    public function reopen(Expense $expense, string $reason, User $user): Expense
    {
        if ($expense->bankEntries()->exists()) {
            throw new RuntimeException('A despesa está conciliada com o extrato. Desfaça a conciliação antes.');
        }

        return ExpenseAuditObserver::withReason($reason, fn () => $this->transition($expense, ['paid'], [
            'status' => 'approved',
            'paid_at' => null,
            'payment_method' => null,
            'paid_by' => null,
            'updated_by' => $user->id,
        ]));
    }

    public function cancel(Expense $expense, string $reason, User $user): Expense
    {
        return ExpenseAuditObserver::withReason($reason, fn () => $this->transition(
            $expense,
            ['draft', 'pending_approval', 'approved'],
            ['status' => 'cancelled', 'updated_by' => $user->id],
        ));
    }

    public function addAttachment(Expense $expense, UploadedFile $file, User $user): ExpenseAttachment
    {
        if ($expense->status === 'cancelled') {
            throw new RuntimeException('Despesa cancelada não recebe comprovante.');
        }

        app(\App\Services\Saas\TenantQuotaService::class)->assertCanStore((int) $expense->tenant_id, $file);
        $extension = strtolower($file->getClientOriginalExtension() ?: ($file->guessExtension() ?? 'bin'));
        $path = $file->storeAs("expenses/{$expense->tenant_id}/{$expense->id}", Str::uuid() . '.' . $extension, 'local');
        if ($path === false) {
            throw new RuntimeException('Não foi possível guardar o comprovante.');
        }

        $attachment = ExpenseAttachment::query()->create([
            'tenant_id' => $expense->tenant_id,
            'expense_id' => $expense->id,
            'path' => $path,
            'original_name' => mb_substr($file->getClientOriginalName(), 0, 200),
            'mime' => (string) $file->getMimeType(),
            'size' => (int) $file->getSize(),
            'uploaded_by' => $user->id,
        ]);

        ExpenseAuditObserver::log($expense, 'attachment_added', ['attachment' => ['from' => null, 'to' => $attachment->original_name]]);

        return $attachment;
    }

    public function removeAttachment(ExpenseAttachment $attachment, Expense $expense, string $reason): void
    {
        Storage::disk('local')->delete($attachment->path);
        $attachment->delete();

        ExpenseAuditObserver::log($expense, 'attachment_removed', ['attachment' => ['from' => $attachment->original_name, 'to' => null]], $reason);
    }

    /**
     * @param  array<int, string>  $from
     * @param  array<string, mixed>  $attributes
     */
    private function transition(Expense $expense, array $from, array $attributes): Expense
    {
        if ($expense->system_key !== null) {
            throw new RuntimeException('Despesa mantida pelo sistema a partir do extrato; não pode ser alterada.');
        }

        return DB::transaction(function () use ($expense, $from, $attributes) {
            $locked = $this->lock($expense);
            if (! in_array($locked->status, $from, true)) {
                throw new RuntimeException('A despesa mudou de situação. Atualize a tela e tente novamente.');
            }

            $locked->update($attributes);

            return $locked;
        });
    }

    private function lock(Expense $expense): Expense
    {
        return Expense::query()->whereKey($expense->id)->lockForUpdate()->firstOrFail();
    }

    private function assertEditable(Expense $expense): void
    {
        if ($expense->system_key !== null) {
            throw new RuntimeException('Despesa mantida pelo sistema a partir do extrato; não pode ser editada.');
        }
        if (in_array($expense->status, ['paid', 'cancelled'], true)) {
            throw new RuntimeException('Despesa paga ou cancelada não pode ser editada.');
        }
    }

    /** Categoria, centro de custo e fornecedor precisam ser da mesma escola. */
    private function assertReferences(int $tenantId, array $data): void
    {
        foreach ([
            'supplier_id' => [Supplier::class, 'Fornecedor'],
            'category_id' => [FinanceCategory::class, 'Categoria'],
            'cost_center_id' => [CostCenter::class, 'Centro de custo'],
        ] as $field => [$model, $label]) {
            if (! empty($data[$field]) && ! $model::query()->where('tenant_id', $tenantId)->whereKey($data[$field])->exists()) {
                throw new RuntimeException("{$label} não encontrado.");
            }
        }
    }
}

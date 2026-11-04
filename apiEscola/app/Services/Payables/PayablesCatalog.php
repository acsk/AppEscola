<?php

namespace App\Services\Payables;

use App\Models\CostCenter;
use App\Models\Expense;
use App\Models\FinanceCategory;
use App\Models\Supplier;

/**
 * Categorias, centros de custo e fornecedores das despesas. Cada escola recebe uma lista inicial no
 * primeiro uso (configuração, não dados fictícios), que pode ser editada depois.
 */
class PayablesCatalog
{
    private const DEFAULT_CATEGORIES = [
        'Pessoal' => null,
        'Ocupação' => null,
        'Utilidades' => null,
        'Marketing' => null,
        'Material didático' => null,
        'Impostos' => null,
        'Tarifas bancárias' => FinanceCategory::BANK_FEES,
        'Outros' => null,
    ];

    private const DEFAULT_COST_CENTERS = ['Administrativo', 'Pedagógico', 'Comercial'];

    public const PAYMENT_METHOD_LABELS = [
        'pix' => 'Pix',
        'transfer' => 'Transferência',
        'bank_slip' => 'Boleto',
        'auto_debit' => 'Débito automático',
        'card' => 'Cartão',
        'cash' => 'Dinheiro',
    ];

    public function ensureDefaults(int $tenantId): void
    {
        if (! FinanceCategory::query()->where('tenant_id', $tenantId)->exists()) {
            foreach (self::DEFAULT_CATEGORIES as $name => $key) {
                FinanceCategory::query()->firstOrCreate(['tenant_id' => $tenantId, 'name' => $name], ['system_key' => $key]);
            }
        }

        if (! CostCenter::query()->where('tenant_id', $tenantId)->exists()) {
            foreach (self::DEFAULT_COST_CENTERS as $name) {
                CostCenter::query()->firstOrCreate(['tenant_id' => $tenantId, 'name' => $name]);
            }
        }
    }

    public function bankFeesCategory(int $tenantId): FinanceCategory
    {
        return $this->systemRecord(FinanceCategory::class, $tenantId, FinanceCategory::BANK_FEES, 'Tarifas bancárias');
    }

    public function coraSupplier(int $tenantId): Supplier
    {
        return $this->systemRecord(Supplier::class, $tenantId, Supplier::CORA, 'Banco Cora');
    }

    /** @return array<string, mixed> */
    public function options(int $tenantId): array
    {
        $this->ensureDefaults($tenantId);

        $list = fn (string $model) => $model::query()
            ->where('tenant_id', $tenantId)
            ->where('active', true)
            ->orderBy('name')
            ->get(['id', 'name'])
            ->map(fn ($r) => ['id' => $r->id, 'name' => $r->name])
            ->all();

        return [
            'categories' => $list(FinanceCategory::class),
            'cost_centers' => $list(CostCenter::class),
            'suppliers' => $list(Supplier::class),
            'payment_methods' => collect(self::PAYMENT_METHOD_LABELS)
                ->map(fn ($label, $value) => ['value' => $value, 'label' => $label])
                ->values()
                ->all(),
            'statuses' => Expense::STATUSES,
        ];
    }

    /**
     * Registro usado pelo sistema: procura pela chave; se a escola já tem um com o mesmo nome, adota-o.
     *
     * @template T of FinanceCategory|Supplier
     * @param  class-string<T>  $model
     * @return T
     */
    private function systemRecord(string $model, int $tenantId, string $key, string $name): FinanceCategory|Supplier
    {
        $record = $model::query()->where('tenant_id', $tenantId)->where('system_key', $key)->first();
        if ($record) {
            return $record;
        }

        $byName = $model::query()->where('tenant_id', $tenantId)->where('name', $name)->whereNull('system_key')->first();
        if ($byName) {
            $byName->update(['system_key' => $key]);

            return $byName;
        }

        return $model::query()->create(['tenant_id' => $tenantId, 'name' => $name, 'system_key' => $key, 'active' => true]);
    }
}

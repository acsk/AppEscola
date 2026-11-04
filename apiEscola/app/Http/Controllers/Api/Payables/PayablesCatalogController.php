<?php

namespace App\Http\Controllers\Api\Payables;

use App\Http\Controllers\Controller;
use App\Models\CostCenter;
use App\Models\FinanceCategory;
use App\Models\Supplier;
use App\Support\FinancePermissions;
use App\Traits\AuthorizesFinance;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Fornecedores (finance.payables.manage) e categorias/centros de custo (finance.configure).
 * Registros usados pelo sistema (tarifas, Banco Cora) podem ser renomeados, não desativados.
 */
class PayablesCatalogController extends Controller
{
    use AuthorizesFinance;

    public function suppliers(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeFinance($request, FinancePermissions::VIEW);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $search = trim((string) ($request->validate(['search' => ['nullable', 'string', 'max:100']])['search'] ?? ''));

        $items = Supplier::query()
            ->where('tenant_id', $tenantId)
            ->when($search !== '', fn ($q) => $q->where('name', 'like', "%{$search}%"))
            ->orderBy('name')
            ->limit(200)
            ->get(['id', 'name', 'document', 'email', 'phone', 'notes', 'active', 'system_key']);

        return $this->success(['items' => $items->map(fn (Supplier $s) => $this->presentSupplier($s))->all()], 'Fornecedores carregados com sucesso.');
    }

    public function storeSupplier(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeFinance($request, FinancePermissions::MANAGE_PAYABLES);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $data = $request->validate($this->supplierRules());
        $supplier = Supplier::query()->create(['tenant_id' => $tenantId, 'active' => true] + $this->cleanSupplier($data));

        return $this->success($this->presentSupplier($supplier), 'Fornecedor cadastrado.', 201);
    }

    public function updateSupplier(Request $request, int $supplier): JsonResponse
    {
        $tenantId = $this->authorizeFinance($request, FinancePermissions::MANAGE_PAYABLES);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $data = $request->validate($this->supplierRules() + ['active' => ['nullable', 'boolean']]);
        $model = Supplier::query()->where('tenant_id', $tenantId)->find($supplier);
        if (! $model) {
            return $this->error('Fornecedor não encontrado.', null, 404);
        }

        $attributes = $this->cleanSupplier($data);
        if (array_key_exists('active', $data) && $model->system_key === null) {
            $attributes['active'] = (bool) $data['active'];
        }
        $model->update($attributes);

        return $this->success($this->presentSupplier($model), 'Fornecedor atualizado.');
    }

    public function storeCategory(Request $request): JsonResponse
    {
        return $this->storeNamed($request, FinanceCategory::class, 'finance_categories', 'Categoria cadastrada.');
    }

    public function updateCategory(Request $request, int $category): JsonResponse
    {
        return $this->updateNamed($request, FinanceCategory::class, 'finance_categories', $category, 'Categoria atualizada.', 'Categoria não encontrada.');
    }

    public function storeCostCenter(Request $request): JsonResponse
    {
        return $this->storeNamed($request, CostCenter::class, 'cost_centers', 'Centro de custo cadastrado.');
    }

    public function updateCostCenter(Request $request, int $costCenter): JsonResponse
    {
        return $this->updateNamed($request, CostCenter::class, 'cost_centers', $costCenter, 'Centro de custo atualizado.', 'Centro de custo não encontrado.');
    }

    /** @param  class-string<Model>  $model */
    private function storeNamed(Request $request, string $model, string $table, string $message): JsonResponse
    {
        $tenantId = $this->authorizeFinance($request, FinancePermissions::CONFIGURE);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $name = trim($request->validate([
            'name' => ['required', 'string', 'max:80', Rule::unique($table, 'name')->where('tenant_id', $tenantId)],
        ])['name']);
        $record = $model::query()->create(['tenant_id' => $tenantId, 'name' => $name, 'active' => true]);

        return $this->success(['id' => $record->id, 'name' => $record->name, 'active' => true], $message, 201);
    }

    /** @param  class-string<Model>  $model */
    private function updateNamed(Request $request, string $model, string $table, int $id, string $message, string $notFound): JsonResponse
    {
        $tenantId = $this->authorizeFinance($request, FinancePermissions::CONFIGURE);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:80', Rule::unique($table, 'name')->where('tenant_id', $tenantId)->ignore($id)],
            'active' => ['nullable', 'boolean'],
        ]);
        $record = $model::query()->where('tenant_id', $tenantId)->find($id);
        if (! $record) {
            return $this->error($notFound, null, 404);
        }

        $attributes = ['name' => trim($data['name'])];
        if (array_key_exists('active', $data) && ($record->system_key ?? null) === null) {
            $attributes['active'] = (bool) $data['active'];
        }
        $record->update($attributes);

        return $this->success(['id' => $record->id, 'name' => $record->name, 'active' => (bool) $record->active], $message);
    }

    /** @return array<string, array<int, mixed>> */
    private function supplierRules(): array
    {
        return [
            'name' => ['required', 'string', 'max:150'],
            'document' => ['nullable', 'string', 'max:20'],
            'email' => ['nullable', 'email', 'max:150'],
            'phone' => ['nullable', 'string', 'max:30'],
            'notes' => ['nullable', 'string', 'max:500'],
        ];
    }

    /** @param  array<string, mixed>  $data */
    private function cleanSupplier(array $data): array
    {
        $document = preg_replace('/\D/', '', (string) ($data['document'] ?? ''));

        return [
            'name' => trim($data['name']),
            'document' => $document !== '' ? $document : null,
            'email' => $data['email'] ?? null,
            'phone' => $data['phone'] ?? null,
            'notes' => $data['notes'] ?? null,
        ];
    }

    /** @return array<string, mixed> */
    private function presentSupplier(Supplier $supplier): array
    {
        return [
            'id' => $supplier->id,
            'name' => $supplier->name,
            'document' => $supplier->document,
            'email' => $supplier->email,
            'phone' => $supplier->phone,
            'notes' => $supplier->notes,
            'active' => (bool) $supplier->active,
            'system_managed' => $supplier->system_key !== null,
        ];
    }
}

<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreSubjectRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $tenantId = $this->resolveTenantId();

        return [
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('subjects', 'name')->where(fn ($query) => $query->where('tenant_id', $tenantId)),
            ],
            'description' => ['nullable', 'string'],
            'icon' => ['nullable', 'string', 'max:100'],
            'color' => ['nullable', 'string', 'regex:/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/'],
            'status' => ['nullable', Rule::in(['active', 'inactive'])],
        ];
    }

    private function resolveTenantId(): ?int
    {
        if ($this->filled('_tenant_id')) {
            return (int) $this->input('_tenant_id');
        }

        $user = $this->user();

        if ($user?->isSuperAdmin()) {
            return $this->query('tenant_id') ? (int) $this->query('tenant_id') : null;
        }

        return $user?->tenant_id;
    }
}

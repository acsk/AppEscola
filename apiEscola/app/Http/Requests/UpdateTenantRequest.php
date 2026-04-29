<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateTenantRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'corporate_name' => ['sometimes', 'string', 'max:255'],
            'trade_name'     => ['nullable', 'string', 'max:255'],
            'name'           => ['sometimes', 'string', 'max:255'],
            'slug'           => ['sometimes', 'string', 'max:255', 'regex:/^[a-z0-9-]+$/', Rule::unique('tenants', 'slug')->ignore($this->route('tenant'))],
            'cnpj'           => ['nullable', 'string', 'max:20', Rule::unique('tenants', 'cnpj')->ignore($this->route('tenant'))],
            'email'          => ['nullable', 'email', 'max:255'],
            'phone'          => ['nullable', 'string', 'max:20'],
            'whatsapp'       => ['nullable', 'string', 'max:20'],
            'zip_code'       => ['nullable', 'string', 'max:10'],
            'street'         => ['nullable', 'string', 'max:255'],
            'number'         => ['nullable', 'string', 'max:20'],
            'complement'     => ['nullable', 'string', 'max:100'],
            'neighborhood'   => ['nullable', 'string', 'max:100'],
            'city'           => ['nullable', 'string', 'max:100'],
            'state'          => ['nullable', 'string', 'size:2'],
            'status'         => ['nullable', 'exists:domain_statuses,slug'],
            'settings'       => ['nullable', 'array'],
        ];
    }
}

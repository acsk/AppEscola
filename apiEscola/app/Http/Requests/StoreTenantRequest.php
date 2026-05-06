<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreTenantRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $address = $this->input('address');

        if (! is_array($address)) {
            return;
        }

        $fields = ['zip_code', 'street', 'number', 'complement', 'neighborhood', 'city', 'state'];
        $merge = [];

        foreach ($fields as $field) {
            // Mantem precedencia para o formato plano quando enviado.
            if (! $this->exists($field) && array_key_exists($field, $address)) {
                $merge[$field] = $address[$field];
            }
        }

        if ($merge !== []) {
            $this->merge($merge);
        }
    }

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'corporate_name' => ['required', 'string', 'max:255'],
            'trade_name'     => ['nullable', 'string', 'max:255'],
            'name'           => ['required', 'string', 'max:255'],
            'slug'           => ['required', 'string', 'max:255', 'regex:/^[a-z0-9-]+$/', Rule::unique('tenants', 'slug')],
            'cnpj'           => ['nullable', 'string', 'max:20', Rule::unique('tenants', 'cnpj')],
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

            // Usuário administrador inicial do tenant
            'admin_name'     => ['required', 'string', 'max:255'],
            'admin_email'    => ['required', 'email', 'max:255', Rule::unique('users', 'email')],
            'admin_password' => ['required', 'string', 'min:6', 'confirmed'],
        ];
    }
}

<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdatePaymentProviderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => 'sometimes|string|max:255',
            'slug' => [
                'sometimes',
                'string',
                'max:100',
                Rule::unique('payment_providers', 'slug')->ignore($this->route('payment_provider')),
            ],
            'description' => 'nullable|string|max:1000',
            'logo_url' => 'nullable|string|url|max:500',
            'is_active' => 'nullable|boolean',
            'order' => 'nullable|integer|min:0',
        ];
    }

    public function messages(): array
    {
        return [
            'slug.unique' => 'Este slug já está sendo utilizado.',
            'logo_url.url' => 'Logo URL deve ser uma URL válida.',
        ];
    }
}

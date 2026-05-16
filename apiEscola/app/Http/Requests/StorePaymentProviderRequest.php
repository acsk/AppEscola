<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StorePaymentProviderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => 'required|string|max:255',
            'slug' => 'required|string|unique:payment_providers,slug|max:100',
            'description' => 'nullable|string|max:1000',
            'logo_url' => 'nullable|string|url|max:500',
            'is_active' => 'nullable|boolean',
            'order' => 'nullable|integer|min:0',
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'Nome do provedor é obrigatório.',
            'slug.required' => 'Slug é obrigatório.',
            'slug.unique' => 'Este slug já está sendo utilizado.',
            'logo_url.url' => 'Logo URL deve ser uma URL válida.',
        ];
    }
}

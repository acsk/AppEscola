<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreGuardianRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'user_id' => ['nullable', 'exists:users,id'],
            'name' => ['required', 'string', 'max:255'],
            'document' => [
                'required',
                'string',
                'max:20',
            ],
            'email' => ['required', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:20'],
            'relationship' => ['nullable', 'exists:domain_guardian_relationships,slug'],
        ];
    }

    public function messages(): array
    {
        return [
            'document.unique' => 'Já existe um responsável com este CPF.',
        ];
    }

    public function attributes(): array
    {
        return [
            'document' => 'CPF',
        ];
    }
}

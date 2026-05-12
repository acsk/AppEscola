<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreGuardianRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        if ($this->has('document')) {
            $this->merge([
                'document' => $this->normalizeDocument($this->input('document')),
            ]);
        }
    }

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
                Rule::unique('guardians', 'document')->where('tenant_id', $this->user()->tenant_id),
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

    private function normalizeDocument($value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $digits = preg_replace('/\D+/', '', $value) ?? '';

        return $digits !== '' ? $digits : null;
    }
}

<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateGuardianRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $guardian = $this->route('guardian');
        $guardianId = is_object($guardian) ? $guardian->id : $guardian;

        return [
            'user_id' => ['nullable', 'exists:users,id'],
            'name' => ['sometimes', 'string', 'max:255'],
            'document' => [
                'sometimes',
                'required',
                'string',
                'max:20',
                Rule::unique('guardians', 'document')
                    ->where('tenant_id', $this->user()->tenant_id)
                    ->ignore($guardianId),
            ],
            'email' => ['sometimes', 'required', 'email', 'max:255'],
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

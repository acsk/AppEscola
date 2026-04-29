<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class AttachGuardianRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'guardian_id' => ['required', 'exists:guardians,id'],
            'is_financial_responsible' => ['nullable', 'boolean'],
            'is_pedagogical_responsible' => ['nullable', 'boolean'],
            'can_access_portal' => ['nullable', 'boolean'],
        ];
    }
}

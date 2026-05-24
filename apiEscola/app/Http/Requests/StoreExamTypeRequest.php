<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreExamTypeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'label'      => ['required', 'string', 'max:100'],
            'slug'       => ['nullable', 'string', 'max:50', 'alpha_dash', Rule::unique('exam_types', 'slug')],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:9999'],
            'is_active'  => ['nullable', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'label.required' => 'Informe o nome da classificação.',
            'slug.unique'    => 'Este identificador (slug) já está em uso.',
        ];
    }
}

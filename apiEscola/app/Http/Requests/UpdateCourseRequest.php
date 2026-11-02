<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCourseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'status' => ['nullable', Rule::in(['active', 'inactive'])],
            // Concurso que o curso prepara (base do índice de Preparação do BI).
            'target_exam_type_id' => ['nullable', 'integer', Rule::exists('exam_types', 'id')],
        ];
    }
}

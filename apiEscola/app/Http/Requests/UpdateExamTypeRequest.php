<?php

namespace App\Http\Requests;

use App\Models\ExamType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateExamTypeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $examType = $this->resolveRouteExamType();

        return [
            'label'      => ['sometimes', 'string', 'max:100'],
            'slug'       => [
                'sometimes',
                'string',
                'max:50',
                'alpha_dash',
                Rule::unique('exam_types', 'slug')->ignore($examType),
            ],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:9999'],
            'is_active'  => ['sometimes', 'boolean'],
        ];
    }

  /**
     * Rota: PUT admin/exam-types/{examType}
     * O parâmetro é camelCase (`examType`), não `exam_type`.
     */
    private function resolveRouteExamType(): ?ExamType
    {
        $param = $this->route('examType');

        if ($param instanceof ExamType) {
            return $param;
        }

        if (is_numeric($param)) {
            return ExamType::query()->find((int) $param);
        }

        return null;
    }
}

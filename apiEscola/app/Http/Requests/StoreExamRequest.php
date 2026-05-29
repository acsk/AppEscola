<?php

namespace App\Http\Requests;

use App\Rules\ActiveExamTypeSlug;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreExamRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    protected function prepareForValidation(): void
    {
        $ids = $this->input('course_ids');
        if (! is_array($ids)) {
            $ids = [];
        }
        if ($this->filled('course_id')) {
            $ids[] = $this->input('course_id');
        }

        $this->merge([
            'course_ids' => array_values(array_unique(array_map('intval', array_filter($ids)))),
        ]);
    }

    public function rules(): array
    {
        return [
            'course_ids'       => ['nullable', 'array'],
            'course_ids.*'     => ['integer', 'exists:courses,id'],
            'course_id'        => ['nullable', 'integer', 'exists:courses,id'],
            'subject_id'       => ['nullable', 'exists:subjects,id'],
            'title'            => ['required', 'string', 'max:255'],
            'description'      => ['nullable', 'string'],
            'exam_type'        => ['required', 'string', new ActiveExamTypeSlug()],
            'status'           => ['nullable', 'string', 'exists:exam_statuses,slug'],
            'duration_minutes' => ['nullable', 'integer', 'min:1'],
            'passing_score'       => ['nullable', 'numeric', 'min:0', 'max:100'],
            'starts_at'           => ['nullable', 'date'],
            'ends_at'             => ['nullable', 'date', 'after_or_equal:starts_at'],
            'release_results_after_end' => ['nullable', 'boolean'],
            'allow_retake'        => ['nullable', 'boolean'],
            'max_attempts'        => ['nullable', 'integer', 'min:1', 'max:255'],
            'min_score_to_retake' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            if ($this->boolean('release_results_after_end') && ! $this->input('ends_at')) {
                $validator->errors()->add('ends_at', 'Informe a data final para liberar o resultado somente após o fechamento do período.');
            }

            if (($this->input('status') ?? 'draft') === 'published') {
                $validator->errors()->add(
                    'status',
                    'Não é possível publicar um simulado sem questões. Salve como rascunho, cadastre ao menos uma questão completa e publique em seguida.'
                );
            }
        });
    }
}

<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreExamRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'course_id'        => ['nullable', 'exists:courses,id'],
            'subject_id'       => ['nullable', 'exists:subjects,id'],
            'title'            => ['required', 'string', 'max:255'],
            'description'      => ['nullable', 'string'],
            'exam_type'        => ['nullable', 'string', 'exists:exam_types,slug'],
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
        });
    }
}

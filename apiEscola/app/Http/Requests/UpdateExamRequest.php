<?php

namespace App\Http\Requests;

use App\Services\ExamPublishValidator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class UpdateExamRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    protected function prepareForValidation(): void
    {
        if (! $this->has('course_ids') && ! $this->has('course_id')) {
            return;
        }

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
            'course_ids'       => ['sometimes', 'nullable', 'array'],
            'course_ids.*'     => ['integer', 'exists:courses,id'],
            'course_id'        => ['sometimes', 'nullable', 'integer', 'exists:courses,id'],
            'subject_id'       => ['sometimes', 'nullable', 'exists:subjects,id'],
            'title'            => ['sometimes', 'string', 'max:255'],
            'description'      => ['sometimes', 'nullable', 'string'],
            'exam_type'        => ['sometimes', 'string', 'exists:exam_types,slug'],
            'status'           => ['sometimes', 'string', 'exists:exam_statuses,slug'],
            'duration_minutes' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'passing_score'       => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            'starts_at'           => ['sometimes', 'nullable', 'date'],
            'ends_at'             => ['sometimes', 'nullable', 'date', 'after_or_equal:starts_at'],
            'release_results_after_end' => ['sometimes', 'nullable', 'boolean'],
            'allow_retake'        => ['sometimes', 'nullable', 'boolean'],
            'max_attempts'        => ['sometimes', 'nullable', 'integer', 'min:1', 'max:255'],
            'min_score_to_retake' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            $releaseResultsAfterEnd = $this->has('release_results_after_end')
                ? $this->boolean('release_results_after_end')
                : (bool) $this->route('exam')?->release_results_after_end;

            $endsAt = $this->has('ends_at')
                ? $this->input('ends_at')
                : $this->route('exam')?->ends_at;

            if ($releaseResultsAfterEnd && ! $endsAt) {
                $validator->errors()->add('ends_at', 'Informe a data final para liberar o resultado somente após o fechamento do período.');
            }

            $exam = $this->route('exam');

            if ($exam) {
                $targetStatus = $this->input('status', $exam->examStatus?->slug);
                app(ExamPublishValidator::class)->validate($validator, $exam, (string) $targetStatus);
            }
        });
    }
}

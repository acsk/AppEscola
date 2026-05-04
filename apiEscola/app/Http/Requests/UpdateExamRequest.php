<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateExamRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'course_id'        => ['sometimes', 'nullable', 'exists:courses,id'],
            'subject_id'       => ['sometimes', 'nullable', 'exists:subjects,id'],
            'title'            => ['sometimes', 'string', 'max:255'],
            'description'      => ['sometimes', 'nullable', 'string'],
            'exam_type'        => ['sometimes', 'string', 'exists:exam_types,slug'],
            'status'           => ['sometimes', 'string', 'exists:exam_statuses,slug'],
            'duration_minutes' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'passing_score'    => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            'starts_at'        => ['sometimes', 'nullable', 'date'],
            'ends_at'          => ['sometimes', 'nullable', 'date', 'after_or_equal:starts_at'],
        ];
    }
}

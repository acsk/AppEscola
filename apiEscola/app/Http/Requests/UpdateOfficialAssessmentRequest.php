<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateOfficialAssessmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'course_id' => ['sometimes', 'nullable', 'integer', 'exists:courses,id'],
            'school_class_id' => ['sometimes', 'required', 'integer', 'exists:school_classes,id'],
            'subject_id' => ['sometimes', 'nullable', 'integer', 'exists:subjects,id'],
            'subject_ids' => ['sometimes', 'array', 'min:1'],
            'subject_ids.*' => ['integer', 'distinct', 'exists:subjects,id'],
            'exam_type_id' => ['sometimes', 'nullable', 'integer', 'exists:exam_types,id'],
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'kind' => ['sometimes', 'required', 'string', Rule::in([
                'presencial_bimestral',
                'presencial_recuperacao',
                'presencial_diagnostico',
                'presencial_final',
                'outro',
            ])],
            'assessment_date' => ['sometimes', 'required', 'date_format:Y-m-d'],
            'max_score' => ['sometimes', 'numeric', 'min:0.01', 'max:1000'],
            'weight' => ['sometimes', 'numeric', 'min:0.01', 'max:100'],
            'counts_towards_report_card' => ['sometimes', 'boolean'],
            'status' => ['sometimes', Rule::in(['draft', 'published'])],
            'notes' => ['sometimes', 'nullable', 'string', 'max:3000'],
        ];
    }
}

<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpsertOfficialAssessmentGradesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $rows = collect($this->input('grades', []))
            ->map(function ($row) {
                if (! is_array($row)) {
                    return $row;
                }

                $isAbsent = filter_var($row['is_absent'] ?? false, FILTER_VALIDATE_BOOLEAN);
                if ($isAbsent) {
                    $row['grade'] = null;
                }

                return $row;
            })
            ->all();

        $this->merge(['grades' => $rows]);
    }

    public function rules(): array
    {
        return [
            'grades' => ['required', 'array', 'min:1'],
            'grades.*.student_id' => ['required', 'integer', 'exists:students,id'],
            'grades.*.enrollment_id' => ['nullable', 'integer', 'exists:enrollments,id'],
            'grades.*.grade' => ['nullable', 'numeric', 'min:0', 'max:1000'],
            'grades.*.is_absent' => ['sometimes', 'boolean'],
            'grades.*.notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}

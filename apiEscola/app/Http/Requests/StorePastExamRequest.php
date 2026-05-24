<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\MergesPastExamCourseIds;
use App\Http\Requests\Concerns\NormalizesPastExamSchedule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StorePastExamRequest extends FormRequest
{
    use MergesPastExamCourseIds;
    use NormalizesPastExamSchedule;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->mergePastExamCourseIds();
        $this->normalizePastExamSchedule();
    }

    public function messages(): array
    {
        return $this->pastExamScheduleMessages();
    }

    public function rules(): array
    {
        $examTypes = array_keys(config('past_exams.exam_types', []));

        return [
            'title'        => ['required', 'string', 'max:255'],
            'description'  => ['nullable', 'string', 'max:2000'],
            'exam_year'    => ['nullable', 'integer', 'min:1990', 'max:2100'],
            'exam_date'    => ['nullable', 'date_format:Y-m-d'],
            'exam_type'    => ['nullable', 'string', Rule::in($examTypes)],
            'course_ids'   => ['nullable', 'array'],
            'course_ids.*' => $this->pastExamCourseIdItemRules(),
            'course_id'    => $this->pastExamLegacyCourseIdRules(),
            'subject_id'   => ['nullable', 'integer', 'exists:subjects,id'],
            'type'         => ['required', 'in:file'],
            'content'      => ['required', 'string', 'url'],
            'is_published' => ['nullable', 'boolean'],
            'sort_order'   => ['nullable', 'integer', 'min:0', 'max:99999'],
        ];
    }
}

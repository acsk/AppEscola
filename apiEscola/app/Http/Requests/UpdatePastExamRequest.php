<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\MergesPastExamCourseIds;
use App\Http\Requests\Concerns\NormalizesPastExamSchedule;
use App\Rules\ActiveExamTypeSlug;
use Illuminate\Foundation\Http\FormRequest;

class UpdatePastExamRequest extends FormRequest
{
    use MergesPastExamCourseIds;
    use NormalizesPastExamSchedule;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->mergePastExamCourseIds(onlyWhenPresent: true);
        $this->normalizePastExamSchedule();
    }

    public function messages(): array
    {
        return $this->pastExamScheduleMessages();
    }

    public function rules(): array
    {
        return [
            'title'        => ['sometimes', 'string', 'max:255'],
            'description'  => ['sometimes', 'nullable', 'string', 'max:2000'],
            'exam_year'    => ['sometimes', 'nullable', 'integer', 'min:1990', 'max:2100'],
            'exam_date'    => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'exam_type'    => ['sometimes', 'required', 'string', new ActiveExamTypeSlug()],
            'course_ids'   => ['sometimes', 'nullable', 'array'],
            'course_ids.*' => $this->pastExamCourseIdItemRules(),
            'course_id'    => array_merge(['sometimes'], $this->pastExamLegacyCourseIdRules()),
            'subject_id'   => ['sometimes', 'nullable', 'integer', 'exists:subjects,id'],
            'type'         => ['sometimes', 'in:file'],
            'content'      => ['sometimes', 'string', 'url'],
            'is_published' => ['sometimes', 'boolean'],
            'sort_order'   => ['sometimes', 'integer', 'min:0', 'max:99999'],
        ];
    }
}

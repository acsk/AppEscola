<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdatePastExamRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $examTypes = array_keys(config('past_exams.exam_types', []));

        return [
            'title'        => ['sometimes', 'string', 'max:255'],
            'description'  => ['sometimes', 'nullable', 'string', 'max:2000'],
            'exam_year'    => ['sometimes', 'nullable', 'integer', 'min:1990', 'max:2100'],
            'exam_type'    => ['sometimes', 'nullable', 'string', Rule::in($examTypes)],
            'course_id'    => ['sometimes', 'nullable', 'integer', 'exists:courses,id'],
            'subject_id'   => ['sometimes', 'nullable', 'integer', 'exists:subjects,id'],
            'type'         => ['sometimes', 'in:file'],
            'content'      => ['sometimes', 'string', 'url'],
            'is_published' => ['sometimes', 'boolean'],
            'sort_order'   => ['sometimes', 'integer', 'min:0', 'max:99999'],
        ];
    }
}

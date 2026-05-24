<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\MergesPastExamCourseIds;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UploadPastExamFileRequest extends FormRequest
{
    use MergesPastExamCourseIds;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->mergePastExamCourseIds();
    }

    public function rules(): array
    {
        $examTypes = array_keys(config('past_exams.exam_types', []));

        return [
            'title'        => ['required', 'string', 'max:255'],
            'description'  => ['nullable', 'string', 'max:2000'],
            'exam_year'    => ['nullable', 'integer', 'min:1990', 'max:2100'],
            'exam_type'    => ['nullable', 'string', Rule::in($examTypes)],
            'course_ids'   => ['nullable', 'array'],
            'course_ids.*' => $this->pastExamCourseIdItemRules(),
            'course_id'    => $this->pastExamLegacyCourseIdRules(),
            'subject_id'   => ['nullable', 'integer', 'exists:subjects,id'],
            'is_published' => ['nullable', 'boolean'],
            'sort_order'   => ['nullable', 'integer', 'min:0', 'max:99999'],
            'file'         => ['required', 'file', 'max:150', 'mimes:pdf'],
        ];
    }

    public function messages(): array
    {
        return [
            'title.required' => 'O título da prova é obrigatório.',
            'file.required'  => 'Selecione o arquivo PDF da prova.',
            'file.mimes'     => 'Envie apenas arquivos PDF.',
            'file.max'       => 'O PDF deve ter no máximo 150 kB.',
            'exam_type.in'   => 'Tipo de prova inválido.',
        ];
    }
}

<?php

namespace App\Http\Requests;

use App\Models\QuestionSet;
use App\Rules\ActiveExamTypeSlug;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * POST/PUT /question-bank/question-sets — simulado do banco. Na criação, origin=pdf_import (importação de
 * prova) exige modalidade; no update só nome, descrição e status mudam.
 */
class SaveQuestionSetRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        $creating = $this->isMethod('post');

        return [
            'title'            => [$creating ? 'required' : 'sometimes', 'string', 'max:255'],
            'description'      => ['sometimes', 'nullable', 'string', 'max:2000'],
            'status'           => ['sometimes', Rule::in([QuestionSet::STATUS_DRAFT, QuestionSet::STATUS_PUBLISHED])],
            'origin'           => [$creating ? 'sometimes' : 'prohibited', Rule::in([QuestionSet::ORIGIN_ADMIN, QuestionSet::ORIGIN_PDF_IMPORT])],
            'exam_type'        => [$creating ? 'required_if:origin,'.QuestionSet::ORIGIN_PDF_IMPORT : 'prohibited', 'nullable', new ActiveExamTypeSlug()],
            'source_exam_name' => [$creating ? 'sometimes' : 'prohibited', 'nullable', 'string', 'max:255'],
            'question_ids'     => [$creating ? 'sometimes' : 'prohibited', 'array', 'max:200'],
            'question_ids.*'   => ['integer', 'distinct'],
        ];
    }

    public function attributes(): array
    {
        return ['title' => 'nome do simulado', 'exam_type' => 'modalidade', 'question_ids' => 'questões'];
    }
}

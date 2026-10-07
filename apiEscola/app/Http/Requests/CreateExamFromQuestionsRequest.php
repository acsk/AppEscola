<?php

namespace App\Http\Requests;

use App\Rules\ActiveExamTypeSlug;
use Illuminate\Foundation\Http\FormRequest;

/** POST /question-bank/exams-from-questions — simulado (rascunho) com questões avulsas do banco. */
class CreateExamFromQuestionsRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'title'          => ['required', 'string', 'max:255'],
            'exam_type'      => ['required', new ActiveExamTypeSlug()],
            'description'    => ['sometimes', 'nullable', 'string', 'max:2000'],
            'question_ids'   => ['required', 'array', 'min:1', 'max:120'],
            'question_ids.*' => ['integer', 'distinct'],
        ];
    }

    public function attributes(): array
    {
        return ['title' => 'nome do simulado', 'exam_type' => 'modalidade', 'question_ids' => 'questões'];
    }
}

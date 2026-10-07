<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** POST /question-bank/question-sets/generate — sorteia questões do banco pelos filtros. */
class GenerateQuestionSetRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'title'            => ['required', 'string', 'max:255'],
            'description'      => ['sometimes', 'nullable', 'string', 'max:2000'],
            'quantity'         => ['required', 'integer', 'min:1', 'max:100'],
            'subject_ids'      => ['sometimes', 'array', 'max:30'],
            'subject_ids.*'    => ['integer'],
            'topic_ids'        => ['sometimes', 'array', 'max:60'],
            'topic_ids.*'      => ['integer'],
            'difficulty_ids'   => ['sometimes', 'array', 'max:10'],
            'difficulty_ids.*' => ['integer'],
            'exam_type_ids'    => ['sometimes', 'array', 'max:20'],
            'exam_type_ids.*'  => ['integer'],
        ];
    }

    public function attributes(): array
    {
        return ['title' => 'nome do simulado', 'quantity' => 'quantidade de questões'];
    }
}

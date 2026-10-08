<?php

namespace App\Http\Requests;

use App\Services\Ai\QuestionAiService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** POST /question-bank/ai/classify: questões (um bloco por chamada) e os campos que a IA deve sugerir. */
class QuestionAiClassifyRequest extends FormRequest
{
    /** Questões por chamada à IA (o painel envia a seleção em blocos). */
    public const MAX_QUESTIONS = 10;

    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'question_ids'   => ['required', 'array', 'min:1', 'max:'.self::MAX_QUESTIONS],
            'question_ids.*' => ['integer', 'distinct'],
            'fields'         => ['required', 'array', 'min:1'],
            'fields.*'       => ['string', 'distinct', Rule::in(array_keys(QuestionAiService::CLASSIFY_FIELDS))],
            'subject_id'     => ['sometimes', 'nullable', 'integer'],
        ];
    }

    public function attributes(): array
    {
        return ['question_ids' => 'questões', 'fields' => 'campos', 'subject_id' => 'disciplina'];
    }
}

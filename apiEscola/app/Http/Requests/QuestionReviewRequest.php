<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** POST /question-bank/ai/review e /question-bank/ai/review/correct */
class QuestionReviewRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'question_text' => ['required', 'string', 'max:20000'],
            'explanation' => ['nullable', 'string', 'max:20000'],
            'type' => ['sometimes', 'in:multiple_choice,essay'],
            'options' => ['sometimes', 'array', 'max:10'],
            'options.*.option_text' => ['nullable', 'string', 'max:5000'],
            'options.*.is_correct' => ['sometimes', 'boolean'],
            'subject_name' => ['nullable', 'string', 'max:120'],
            'difficulty_name' => ['nullable', 'string', 'max:80'],
            'topic_names' => ['sometimes', 'array', 'max:5'],
            'topic_names.*' => ['string', 'max:120'],
            'question_id' => ['sometimes', 'nullable', 'integer'],
            'attempts' => ['sometimes', 'integer', 'min:0', 'max:20'],
            'force' => ['sometimes', 'boolean'],
        ];
    }
}

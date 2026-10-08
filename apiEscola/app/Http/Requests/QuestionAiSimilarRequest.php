<?php

namespace App\Http\Requests;

use App\Support\AiPromptGuard;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Validator;

/** POST /question-bank/questions/{question}/ai/similar */
class QuestionAiSimilarRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'quantity'      => ['required', 'integer', 'between:1,10'],
            'difficulty_id' => ['sometimes', 'nullable', 'integer', 'exists:question_difficulties,id'],
            'options_count' => ['sometimes', 'nullable', 'integer', 'between:2,10'],
            'instructions'  => ['sometimes', 'nullable', 'string', 'max:500'],
            // Estado atual do formulário (pode ter edições não salvas): substitui a questão gravada no prompt.
            'context'                       => ['sometimes', 'array'],
            'context.type'                  => ['sometimes', 'in:multiple_choice,essay'],
            'context.question_text'         => ['sometimes', 'nullable', 'string', 'max:20000'],
            'context.explanation'           => ['sometimes', 'nullable', 'string', 'max:20000'],
            'context.image_url'             => ['sometimes', 'nullable', 'string', 'max:2048'],
            'context.options'               => ['sometimes', 'array', 'max:10'],
            'context.options.*.option_text' => ['nullable', 'string', 'max:5000'],
            'context.options.*.is_correct'  => ['sometimes', 'boolean'],
            'context.subject_id'            => ['sometimes', 'nullable', 'integer'],
            'context.topic_ids'             => ['sometimes', 'array', 'max:30'],
            'context.topic_ids.*'           => ['integer'],
            'context.board_id'              => ['sometimes', 'nullable', 'integer'],
            'context.year'                  => ['sometimes', 'nullable', 'integer', 'between:1900,2100'],
            'context.exam_type_id'          => ['sometimes', 'nullable', 'integer'],
            'context.tags'                  => ['sometimes', 'array', 'max:20'],
            'context.tags.*'                => ['string', 'max:50'],
            'context.source_exam_name'      => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
    }

    public function attributes(): array
    {
        return [
            'quantity'      => 'quantidade de questões',
            'difficulty_id' => 'dificuldade',
            'options_count' => 'número de alternativas',
            'instructions'  => 'observação',
        ];
    }

    /** A observação vai para o prompt: recusa texto que tenta sobrescrever as regras da IA. */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            if (AiPromptGuard::looksLikeInjection($this->input('instructions'))) {
                Log::warning('IA: observação recusada por possível prompt injection', [
                    'user_id' => $this->user()?->id,
                    'excerpt' => mb_substr((string) $this->input('instructions'), 0, 200),
                ]);
                $validator->errors()->add(
                    'instructions',
                    'A observação deve tratar só do conteúdo das questões (tema, contexto, estilo). Remova comandos para a IA.'
                );
            }
        });
    }
}

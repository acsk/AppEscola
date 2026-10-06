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

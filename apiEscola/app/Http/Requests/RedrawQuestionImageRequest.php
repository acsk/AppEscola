<?php

namespace App\Http\Requests;

use App\Support\AiPromptGuard;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/** POST /question-bank/ai/redraw-image: estado atual do editor (a questão pode ainda não estar salva). */
class RedrawQuestionImageRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'question_id'           => ['sometimes', 'nullable', 'integer'],
            'image_url'             => ['required', 'string', 'max:2048'],
            'type'                  => ['sometimes', 'in:multiple_choice,essay'],
            'question_text'         => ['sometimes', 'nullable', 'string', 'max:20000'],
            'options'               => ['sometimes', 'array', 'max:10'],
            'options.*.option_text' => ['nullable', 'string', 'max:5000'],
            'options.*.is_correct'  => ['sometimes', 'boolean'],
            'instructions'          => ['sometimes', 'nullable', 'string', 'max:500'],
        ];
    }

    public function attributes(): array
    {
        return ['image_url' => 'imagem', 'question_text' => 'enunciado', 'instructions' => 'observação'];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            if (AiPromptGuard::looksLikeInjection($this->input('instructions'))) {
                $validator->errors()->add('instructions', 'A observação deve tratar apenas do estilo da imagem, sem comandos para a IA.');
            }
        });
    }
}

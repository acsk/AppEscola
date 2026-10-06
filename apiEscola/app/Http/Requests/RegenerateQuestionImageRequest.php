<?php

namespace App\Http\Requests;

use App\Support\AiPromptGuard;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class RegenerateQuestionImageRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'instructions' => ['sometimes', 'nullable', 'string', 'max:500'],
            'content' => ['required', 'array:type,question_text,explanation,options'],
            'content.type' => ['required', 'in:multiple_choice,essay'],
            'content.question_text' => ['required', 'string', 'max:20000'],
            'content.explanation' => ['sometimes', 'nullable', 'string', 'max:20000'],
            'content.options' => ['required_if:content.type,multiple_choice', 'array', 'max:10'],
            'content.options.*.option_text' => ['required', 'string', 'max:5000'],
            'content.options.*.is_correct' => ['required', 'boolean'],
            'content.options.*.order' => ['sometimes', 'integer', 'min:1'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            if (AiPromptGuard::looksLikeInjection($this->input('instructions'))) {
                $validator->errors()->add('instructions', 'A instrução deve tratar apenas do estilo da imagem, sem comandos para a IA.');
            }
            if ($this->input('content.type') === 'multiple_choice') {
                $options = $this->input('content.options', []);
                if (! is_array($options) || count($options) < 2
                    || count(array_filter($options, fn ($option) => is_array($option) && filter_var($option['is_correct'] ?? false, FILTER_VALIDATE_BOOLEAN))) !== 1) {
                    $validator->errors()->add('content.options', 'Informe pelo menos duas alternativas e exatamente uma correta.');
                }
            }
        });
    }
}

<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * Criação (POST) e edição (PUT) de questão avulsa do banco de questões.
 * Conteúdo + campos opcionais de classificação. Objetiva: 2 a 10 alternativas e exatamente uma correta.
 */
class SaveStandaloneQuestionRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        $creating = $this->isMethod('post');
        $req = $creating ? 'required' : 'sometimes';

        return [
            'type'              => [$req, 'in:multiple_choice,essay'],
            'question_text'     => ['sometimes', 'nullable', 'string', 'max:20000'],
            'image_url'         => ['sometimes', 'nullable', 'url', 'max:500'],
            'video_url'         => ['sometimes', 'nullable', 'url', 'max:500'],
            'explanation'       => ['sometimes', 'nullable', 'string', 'max:20000'],
            'allow_text_answer' => ['sometimes', 'boolean'],

            'options'                       => ['sometimes', 'nullable', 'array', 'max:10'],
            'options.*.option_text'         => ['required', 'string', 'max:5000'],
            'options.*.is_correct'          => ['required', 'boolean'],
            'options.*.triggers_text_input' => ['nullable', 'boolean'],
            'options.*.order'               => ['nullable', 'integer', 'min:1'],
        ] + UpdateQuestionClassificationRequest::classificationRules();
    }

    public function attributes(): array
    {
        return [
            'type'                  => 'tipo',
            'question_text'         => 'enunciado',
            'image_url'             => 'imagem',
            'explanation'           => 'explicação',
            'options'               => 'alternativas',
            'options.*.option_text' => 'texto da alternativa',
        ] + (new UpdateQuestionClassificationRequest())->attributes();
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            $current = $this->route('question') ? \App\Models\ExamQuestion::find((int) $this->route('question')) : null;

            $type = $this->input('type', $current?->type);
            $text = $this->has('question_text') ? $this->input('question_text') : $current?->question_text;
            $image = $this->has('image_url') ? $this->input('image_url') : $current?->image_url;

            if (trim((string) $text) === '' && trim((string) $image) === '') {
                $validator->errors()->add('question_text', 'Informe o texto do enunciado, a imagem, ou ambos.');
            }

            // Objetiva: valida as alternativas enviadas (na criação, ou na edição quando vierem ou o tipo mudar).
            $mustCheckOptions = $type === 'multiple_choice'
                && ($this->isMethod('post') || $this->has('options') || ($current && $current->type !== 'multiple_choice'));
            if (! $mustCheckOptions) {
                return;
            }

            $options = array_values(array_filter(
                (array) $this->input('options', []),
                fn ($o) => trim((string) ($o['option_text'] ?? '')) !== ''
            ));
            if (count($options) < 2) {
                $validator->errors()->add('options', 'Informe pelo menos 2 alternativas preenchidas.');
            } elseif (count(array_filter($options, fn ($o) => filter_var($o['is_correct'] ?? false, FILTER_VALIDATE_BOOLEAN))) !== 1) {
                $validator->errors()->add('options', 'Marque exatamente uma alternativa como correta.');
            }
        });
    }
}

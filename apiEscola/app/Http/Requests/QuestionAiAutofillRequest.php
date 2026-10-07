<?php

namespace App\Http\Requests;

use App\Support\QuestionRichText;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/** POST /question-bank/ai/autofill: enunciado (obrigatório) e, opcionalmente, tipo e alternativas já digitadas. */
class QuestionAiAutofillRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'question_text'         => ['required', 'string', 'max:20000'],
            'type'                  => ['sometimes', 'nullable', 'in:multiple_choice,essay'],
            'options'               => ['sometimes', 'nullable', 'array', 'max:10'],
            'options.*.option_text' => ['nullable', 'string', 'max:5000'],
            // Importação de PDF: disciplinas da prova (a IA só classifica dentro delas).
            'subject_ids'           => ['sometimes', 'array', 'max:20'],
            'subject_ids.*'         => ['integer', 'distinct'],
        ];
    }

    public function attributes(): array
    {
        return [
            'question_text' => 'enunciado',
            'type'          => 'tipo',
            'options'       => 'alternativas',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            if (mb_strlen(trim(QuestionRichText::plain((string) $this->input('question_text')))) < 15) {
                $validator->errors()->add('question_text', 'Escreva um enunciado com pelo menos 15 caracteres para usar a IA.');
            }
        });
    }
}

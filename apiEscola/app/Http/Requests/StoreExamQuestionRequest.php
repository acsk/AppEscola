<?php

namespace App\Http\Requests;

use App\Rules\ActiveExamTypeSlug;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreExamQuestionRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'subject_id'    => ['nullable', 'exists:subjects,id'],
            'exam_type'     => ['required', 'string', new ActiveExamTypeSlug()],
            'type'          => ['required', 'in:multiple_choice,essay'],
            'question_text' => ['nullable', 'string'],
            'image_url'     => ['nullable', 'url', 'max:500'],
            'video_url'     => ['nullable', 'url', 'max:500'],
            'points'        => ['nullable', 'numeric', 'min:0.01'],
            'order'         => ['nullable', 'integer', 'min:1'],
            'explanation'        => ['nullable', 'string'],
            'allow_text_answer'  => ['nullable', 'boolean'],

            // Opções (obrigatório para questão objetiva)
            'options'              => ['required_if:type,multiple_choice', 'nullable', 'array', 'min:2', 'max:10'],
            'options.*.option_text'         => ['required', 'string'],
            'options.*.is_correct'          => ['required', 'boolean'],
            'options.*.triggers_text_input' => ['nullable', 'boolean'],
            'options.*.order'               => ['nullable', 'integer', 'min:1'],
        ];
    }

    public function messages(): array
    {
        return [
            'options.required_if' => 'Questões objetivas devem ter pelo menos 2 opções de resposta.',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            $questionText = trim((string) $this->input('question_text', ''));
            $imageUrl = trim((string) $this->input('image_url', ''));

            if ($questionText === '' && $imageUrl === '') {
                $validator->errors()->add('question_text', 'Informe o texto do enunciado, a imagem, ou ambos.');
            }
        });
    }
}

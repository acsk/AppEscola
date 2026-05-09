<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class UpdateExamQuestionRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'subject_id'    => ['sometimes', 'nullable', 'exists:subjects,id'],
            'type'          => ['sometimes', 'in:multiple_choice,essay'],
            'question_text' => ['sometimes', 'nullable', 'string'],
            'image_url'     => ['sometimes', 'nullable', 'url', 'max:500'],
            'video_url'     => ['sometimes', 'nullable', 'url', 'max:500'],
            'points'        => ['sometimes', 'numeric', 'min:0.01'],
            'order'         => ['sometimes', 'integer', 'min:1'],
            'explanation'        => ['sometimes', 'nullable', 'string'],
            'allow_text_answer'  => ['sometimes', 'boolean'],

            'options'              => ['sometimes', 'nullable', 'array', 'min:2', 'max:10'],
            'options.*.id'                  => ['sometimes', 'nullable', 'exists:exam_question_options,id'],
            'options.*.option_text'         => ['required_with:options', 'string'],
            'options.*.is_correct'          => ['required_with:options', 'boolean'],
            'options.*.triggers_text_input' => ['nullable', 'boolean'],
            'options.*.order'               => ['nullable', 'integer', 'min:1'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            $question = $this->route('question');

            $currentQuestionText = is_object($question) ? (string) ($question->question_text ?? '') : '';
            $currentImageUrl = is_object($question) ? (string) ($question->image_url ?? '') : '';

            $questionText = $this->has('question_text')
                ? trim((string) $this->input('question_text', ''))
                : trim($currentQuestionText);

            $imageUrl = $this->has('image_url')
                ? trim((string) $this->input('image_url', ''))
                : trim($currentImageUrl);

            if ($questionText === '' && $imageUrl === '') {
                $validator->errors()->add('question_text', 'Informe o texto do enunciado, a imagem, ou ambos.');
            }
        });
    }
}

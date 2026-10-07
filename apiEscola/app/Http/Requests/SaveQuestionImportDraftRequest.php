<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class SaveQuestionImportDraftRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('source_exam_name'))) {
            $this->merge(['source_exam_name' => trim($this->input('source_exam_name'))]);
        }
    }

    public function rules(): array
    {
        $rules = [
            'source_exam_name' => ['required', 'string', 'max:255'],
            'revision' => [$this->isMethod('put') ? 'required' : 'prohibited', 'integer', 'min:1'],
            'active_question_key' => ['nullable', 'string', 'max:100'],
            'no_text_pages' => ['present', 'array', 'max:80'],
            'no_text_pages.*' => ['integer', 'min:1', 'max:80', 'distinct'],
            'questions' => ['required', 'array', 'min:1', 'max:50'],
            'questions.*' => ['required', 'array:key,include,sourceNumber,content,classification,needsImage,answerFromPdf'],
            'questions.*.key' => ['required', 'string', 'max:100', 'distinct', 'regex:/^[a-zA-Z0-9_-]+$/'],
            'questions.*.include' => ['required', 'boolean'],
            'questions.*.sourceNumber' => ['required', 'string', 'max:100'],
            'questions.*.needsImage' => ['required', 'boolean'],
            'questions.*.answerFromPdf' => ['required', 'boolean'],
            'questions.*.content' => ['required', 'array:type,question_text,image_url,explanation,options'],
            'questions.*.content.type' => ['required', 'in:multiple_choice,essay'],
            'questions.*.content.question_text' => ['present', 'nullable', 'string', 'max:20000'],
            'questions.*.content.explanation' => ['present', 'nullable', 'string', 'max:20000'],
            'questions.*.content.image_url' => ['present', 'nullable', 'url', 'max:500'],
            'questions.*.content.options' => ['present', 'array', 'max:10'],
            'questions.*.content.options.*' => ['array:key,option_text,is_correct'],
            'questions.*.content.options.*.key' => ['required', 'string', 'max:100'],
            'questions.*.content.options.*.option_text' => ['present', 'nullable', 'string', 'max:5000'],
            'questions.*.content.options.*.is_correct' => ['required', 'boolean'],
            'questions.*.classification' => ['required', 'array:difficulty_id,subject_id,topic_ids,board_id,year,exam_type_id,is_annulled,is_outdated,tags'],
        ];
        foreach (['difficulty_id', 'subject_id', 'board_id', 'exam_type_id'] as $field) {
            $rules["questions.*.classification.{$field}"] = ['present', 'nullable', 'integer', 'min:1'];
        }

        return $rules + [
            'questions.*.classification.year' => ['present', 'nullable', 'integer', 'min:1900', 'max:2100'],
            'questions.*.classification.topic_ids' => ['present', 'array', 'max:30'],
            'questions.*.classification.topic_ids.*' => ['integer', 'min:1'],
            'questions.*.classification.tags' => ['present', 'array', 'max:30'],
            'questions.*.classification.tags.*' => ['string', 'max:50'],
            'questions.*.classification.is_annulled' => ['required', 'boolean'],
            'questions.*.classification.is_outdated' => ['required', 'boolean'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            $questions = $this->input('questions', []);
            if (! is_array($questions) || ! array_is_list($questions)) {
                $validator->errors()->add('questions', 'As questões devem ser uma lista.');

                return;
            }
            $active = $this->input('active_question_key');
            if ($active !== null && ! in_array($active, array_column($questions, 'key'), true)) {
                $validator->errors()->add('active_question_key', 'A aba ativa deve pertencer ao rascunho.');
            }
        });
    }
}

<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class QuestionAiSeparateTextRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'text' => ['required', 'string', 'min:15', 'max:120000'],
            'source_exam_name' => ['required', 'string', 'max:255'],
        ];
    }

    public function attributes(): array
    {
        return ['text' => 'texto do PDF', 'source_exam_name' => 'nome da prova/simulado de origem'];
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('source_exam_name'))) {
            $this->merge(['source_exam_name' => trim($this->input('source_exam_name'))]);
        }
    }
}

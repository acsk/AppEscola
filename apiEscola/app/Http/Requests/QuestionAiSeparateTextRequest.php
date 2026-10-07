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
            // Disciplinas da prova (opcional na API; o painel exige). A IA só classifica dentro delas.
            'subject_ids' => ['sometimes', 'array', 'max:20'],
            'subject_ids.*' => ['integer', 'distinct'],
            // Bloco de páginas em foco (o painel envia provas longas em partes); sem isso, documento inteiro.
            'focus_pages' => ['sometimes', 'array:from,to'],
            'focus_pages.from' => ['required_with:focus_pages', 'integer', 'min:1', 'max:80'],
            'focus_pages.to' => ['required_with:focus_pages', 'integer', 'gte:focus_pages.from', 'max:80'],
        ];
    }

    public function attributes(): array
    {
        return ['text' => 'texto do PDF', 'source_exam_name' => 'nome da prova/simulado de origem', 'subject_ids' => 'disciplinas'];
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('source_exam_name'))) {
            $this->merge(['source_exam_name' => trim($this->input('source_exam_name'))]);
        }
    }
}

<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ReplacePastExamFileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'file' => ['required', 'file', 'max:150', 'mimes:pdf'],
        ];
    }

    public function messages(): array
    {
        return [
            'file.required' => 'Selecione o arquivo PDF da prova.',
            'file.mimes'    => 'Envie apenas arquivos PDF.',
            'file.max'      => 'O PDF deve ter no máximo 150 kB.',
        ];
    }
}

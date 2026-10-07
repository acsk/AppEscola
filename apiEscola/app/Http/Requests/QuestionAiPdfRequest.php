<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class QuestionAiPdfRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return ['pdf' => ['required', 'file', 'mimes:pdf', 'extensions:pdf', 'max:20480']];
    }
}

<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ApplyExamAnswerKeyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'corrections' => ['required', 'array', 'min:1', 'max:500'],
            'corrections.*.question_id' => ['required', 'integer'],
            'corrections.*.option_index' => ['required', 'integer', 'min:0', 'max:9'],
        ];
    }
}

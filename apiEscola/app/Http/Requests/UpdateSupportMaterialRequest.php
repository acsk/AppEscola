<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateSupportMaterialRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'title'       => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:1000'],
            'type'        => ['sometimes', 'in:link,file'],
            'content'     => ['sometimes', 'string'],
        ];
    }

    public function messages(): array
    {
        return [
            'type.in' => 'O tipo deve ser "link" ou "file".',
        ];
    }
}

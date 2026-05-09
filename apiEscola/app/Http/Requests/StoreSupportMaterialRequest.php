<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreSupportMaterialRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'title'       => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:1000'],
            'type'        => ['required', 'in:link,file'],
            'content'     => ['required', 'string'],
        ];
    }

    public function messages(): array
    {
        return [
            'title.required'   => 'O título do material é obrigatório.',
            'type.required'    => 'O tipo de material é obrigatório.',
            'type.in'          => 'O tipo deve ser "link" ou "file".',
            'content.required' => 'O conteúdo (URL ou caminho) é obrigatório.',
        ];
    }
}

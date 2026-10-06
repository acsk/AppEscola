<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** Criação/edição de item de cadastro simples (banca, tag, ...). */
class QuestionCatalogItemRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        $required = $this->isMethod('post') ? 'required' : 'sometimes';
        $maxName = $this->route('catalog') === 'tags' ? 50 : 150;

        return [
            'name'        => [$required, 'string', 'max:'.$maxName, 'regex:/\S/u'],
            'description' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ];
    }

    public function attributes(): array
    {
        return ['name' => 'nome', 'description' => 'descrição'];
    }
}

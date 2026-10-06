<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** Criação/edição de assunto (pertence a uma disciplina). */
class SubjectTopicRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        $required = $this->isMethod('post') ? 'required' : 'sometimes';

        return [
            'subject_id'  => [$required, 'integer'],
            'name'        => [$required, 'string', 'max:150', 'regex:/\S/u'],
            'description' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ];
    }

    public function attributes(): array
    {
        return ['subject_id' => 'disciplina', 'name' => 'nome', 'description' => 'descrição'];
    }
}

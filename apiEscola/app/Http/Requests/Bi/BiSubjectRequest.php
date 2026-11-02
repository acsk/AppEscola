<?php

namespace App\Http\Requests\Bi;

use App\Services\Bi\Sources\AnswerStream;
use Illuminate\Validation\Rule;

/** Filtros globais + fonte das respostas (simulados online, banco ou ambos) da tela Disciplinas e assuntos. */
class BiSubjectRequest extends BiFilterRequest
{
    public function rules(): array
    {
        return parent::rules() + [
            'source' => ['nullable', 'string', Rule::in(AnswerStream::SOURCES)],
            'limit' => ['nullable', 'integer', 'between:1,20'],
        ];
    }

    public function source(): string
    {
        return $this->validated('source') ?? AnswerStream::SOURCE_BOTH;
    }
}

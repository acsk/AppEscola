<?php

namespace App\Http\Requests\Bi;

use App\Services\Bi\StudentEvolutionService;
use Illuminate\Validation\Rule;

/** Filtros globais + busca, recorte (todos/em atenção/em evolução/em queda) e paginação da lista de alunos. */
class BiStudentRequest extends BiFilterRequest
{
    public function rules(): array
    {
        return parent::rules() + [
            'filter' => ['nullable', 'string', Rule::in(StudentEvolutionService::FILTERS)],
            'search' => ['nullable', 'string', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'between:5,100'],
        ];
    }
}

<?php

namespace App\Http\Requests;

class IncludeQuestionImportDraftRequest extends SaveStandaloneQuestionRequest
{
    public function rules(): array
    {
        return parent::rules() + ['revision' => ['required', 'integer', 'min:1']];
    }
}

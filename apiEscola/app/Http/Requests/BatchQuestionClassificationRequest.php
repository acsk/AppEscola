<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** Classificação em lote: cada item tem o id da questão e os campos a alterar. */
class BatchQuestionClassificationRequest extends FormRequest
{
    public const MAX_ITEMS = 500;

    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'items'      => ['required', 'array', 'min:1', 'max:'.self::MAX_ITEMS],
            'items.*.id' => ['required', 'integer', 'distinct'],
        ] + UpdateQuestionClassificationRequest::classificationRules('items.*.');
    }
}

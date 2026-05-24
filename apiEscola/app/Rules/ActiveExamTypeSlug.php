<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Facades\DB;

class ActiveExamTypeSlug implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || $value === '') {
            $fail('Selecione a classificação da prova.');

            return;
        }

        $exists = DB::table('exam_types')
            ->where('slug', $value)
            ->where('is_active', true)
            ->exists();

        if (! $exists) {
            $fail('Classificação de prova inválida ou inativa.');
        }
    }
}

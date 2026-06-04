<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Facades\DB;

class ActiveExamTypeSlug implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (is_int($value) || ctype_digit((string) $value)) {
            $exists = DB::table('exam_types')
                ->where('id', (int) $value)
                ->where('is_active', true)
                ->exists();

            if (! $exists) {
                $fail('Classificação de prova inválida ou inativa.');
            }

            return;
        }

        if (! is_string($value) || trim($value) === '') {
            $fail('Selecione a classificação da prova.');

            return;
        }

        $exists = DB::table('exam_types')
            ->where('slug', mb_strtolower(trim($value)))
            ->where('is_active', true)
            ->exists();

        if (! $exists) {
            $fail('Classificação de prova inválida ou inativa.');
        }
    }
}

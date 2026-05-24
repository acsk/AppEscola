<?php

namespace App\Rules;

use App\Support\StrictIntegerId;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Rejeita bool, float e outros tipos que o cast (int) ou a regra "integer" aceitariam indevidamente.
 */
class StrictPositiveInteger implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (StrictIntegerId::parsePositive($value) === null) {
            $fail('O campo :attribute deve ser um número inteiro positivo.');
        }
    }
}

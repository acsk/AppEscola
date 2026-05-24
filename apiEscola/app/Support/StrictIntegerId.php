<?php

namespace App\Support;

final class StrictIntegerId
{
    /**
     * Aceita apenas inteiros positivos explícitos (int ou string numérica inteira).
     * Rejeita bool, float, arrays e strings não numéricas (evita (int) true === 1).
     */
    public static function parsePositive(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_bool($value) || is_float($value) || is_array($value) || is_object($value)) {
            return null;
        }

        if (is_int($value)) {
            return $value > 0 ? $value : null;
        }

        if (is_string($value)) {
            $trimmed = trim($value);
            if ($trimmed === '' || ! ctype_digit($trimmed)) {
                return null;
            }

            $id = (int) $trimmed;

            return $id > 0 ? $id : null;
        }

        return null;
    }

    /**
     * @param  array<mixed>  $values
     * @return list<int>
     */
    public static function parsePositiveList(array $values): array
    {
        $ids = [];

        foreach ($values as $value) {
            $id = self::parsePositive($value);
            if ($id !== null) {
                $ids[] = $id;
            }
        }

        return array_values(array_unique($ids));
    }
}

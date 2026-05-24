<?php

namespace App\Support;

use Illuminate\Support\Carbon;

/**
 * Parse seguro de datas de prova anterior (evita exceção em prepareForValidation).
 */
final class PastExamDate
{
    /**
     * @return array{exam_date: string, exam_year: int}|null
     */
    public static function scheduleFieldsFromString(string $value): ?array
    {
        $parsed = self::parseIsoDate($value);

        if ($parsed === null) {
            return null;
        }

        return [
            'exam_date' => $parsed->toDateString(),
            'exam_year' => (int) $parsed->format('Y'),
        ];
    }

    public static function parseIsoDate(string $value): ?Carbon
    {
        $value = trim($value);

        if ($value === '') {
            return null;
        }

        $parsed = Carbon::createFromFormat('Y-m-d', $value);

        if (! $parsed instanceof Carbon) {
            return null;
        }

        $errors = Carbon::getLastErrors();

        if (is_array($errors) && (($errors['warning_count'] ?? 0) > 0 || ($errors['error_count'] ?? 0) > 0)) {
            return null;
        }

        if ($parsed->format('Y-m-d') !== $value) {
            return null;
        }

        return $parsed;
    }
}

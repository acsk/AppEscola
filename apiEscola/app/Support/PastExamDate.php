<?php

namespace App\Support;

use DateTimeImmutable;
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

        // DateTimeImmutable não lança com Carbon strict mode em entradas inválidas.
        $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $value);

        if ($parsed === false) {
            return null;
        }

        $errors = DateTimeImmutable::getLastErrors();

        if (is_array($errors) && (($errors['warning_count'] ?? 0) > 0 || ($errors['error_count'] ?? 0) > 0)) {
            return null;
        }

        if ($parsed->format('Y-m-d') !== $value) {
            return null;
        }

        return Carbon::instance($parsed);
    }
}

<?php

namespace App\Http\Requests\Concerns;

use App\Support\PastExamDate;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Normaliza exam_date / exam_year antes da validação do Form Request.
 *
 * @mixin FormRequest
 */
trait NormalizesPastExamSchedule
{
    protected function normalizePastExamSchedule(): void
    {
        if ($this->has('exam_year')) {
            $year = $this->input('exam_year');
            if ($year === '' || $year === null) {
                $this->merge(['exam_year' => null]);
            } elseif (is_numeric($year)) {
                $intYear = (int) $year;
                $this->merge(['exam_year' => $intYear > 0 ? $intYear : null]);
            }
        }

        if ($this->has('exam_date')) {
            $date = $this->input('exam_date');
            if ($date === '' || $date === null) {
                $this->merge(['exam_date' => null]);
            }
        }

        if ($this->filled('exam_date')) {
            $normalized = PastExamDate::scheduleFieldsFromString((string) $this->input('exam_date'));

            if ($normalized !== null) {
                $this->merge($normalized);
            }
        }
    }

    /** @return array<string, string> */
    protected function pastExamScheduleMessages(): array
    {
        return [
            'exam_date.date'         => 'Informe uma data válida da prova (dia/mês/ano).',
            'exam_date.date_format'  => 'Informe uma data válida da prova (dia/mês/ano).',
            'exam_year.integer'  => 'Informe uma data válida da prova.',
            'exam_year.min'      => 'A data da prova deve ser de 1990 em diante.',
            'exam_year.max'      => 'A data da prova não pode ser posterior a 2100.',
        ];
    }
}

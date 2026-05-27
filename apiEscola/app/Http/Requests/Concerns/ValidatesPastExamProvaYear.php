<?php

namespace App\Http\Requests\Concerns;

use App\Models\PastExam;
use App\Support\PastExamDate;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Exige ano/data quando material_kind = prova.
 *
 * @mixin FormRequest
 */
trait ValidatesPastExamProvaYear
{
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if ($validator->errors()->isNotEmpty()) {
                return;
            }

            if (! $this->pastExamMaterialKindIsProva()) {
                return;
            }

            if ($this->pastExamHasScheduleYear()) {
                return;
            }

            $validator->errors()->add(
                'exam_date',
                'Informe o ano da prova (data completa ou pelo menos o ano).',
            );
        });
    }

    protected function pastExamMaterialKindIsProva(): bool
    {
        $kind = $this->input('material_kind');

        if ($kind !== null && $kind !== '') {
            return (string) $kind === 'prova';
        }

        /** @var PastExam|null $existing */
        $existing = $this->route('pastExam');

        return ($existing?->material_kind ?? 'prova') === 'prova';
    }

    protected function pastExamHasScheduleYear(): bool
    {
        $year = $this->input('exam_year');
        if (is_numeric($year) && (int) $year >= 1990) {
            return true;
        }

        $date = $this->input('exam_date');
        if (is_string($date) && $date !== '' && PastExamDate::parseIsoDate($date) !== null) {
            return true;
        }

        if (! $this->isPastExamUpdateRequest()) {
            return false;
        }

        /** @var PastExam|null $existing */
        $existing = $this->route('pastExam');

        return $existing !== null
            && ($existing->exam_year !== null || $existing->exam_date !== null);
    }

    protected function isPastExamUpdateRequest(): bool
    {
        return $this->route('pastExam') instanceof PastExam;
    }

    protected function pastExamProvaYearMessages(): array
    {
        return [
            'exam_date.required' => 'Informe o ano da prova (data completa ou pelo menos o ano).',
        ];
    }
}

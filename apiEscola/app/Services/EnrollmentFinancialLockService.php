<?php

namespace App\Services;

use App\Models\Enrollment;
use Illuminate\Validation\ValidationException;

class EnrollmentFinancialLockService
{
    /** Campos da matrícula que não podem mudar após cobrança baixada (paga). */
    public const LOCKED_FIELDS = [
        'start_date',
        'end_date',
        'monthly_amount',
        'discount_amount',
    ];

    public function isLocked(Enrollment $enrollment): bool
    {
        return $enrollment->invoices()->where('status', 'paid')->exists();
    }

    /**
     * @return list<string>
     */
    public function lockedFieldsFor(Enrollment $enrollment): array
    {
        return $this->isLocked($enrollment) ? self::LOCKED_FIELDS : [];
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    public function assertChangesAllowed(Enrollment $enrollment, array $validated): void
    {
        if (! $this->isLocked($enrollment)) {
            return;
        }

        $errors = [];

        foreach (self::LOCKED_FIELDS as $field) {
            if (! array_key_exists($field, $validated)) {
                continue;
            }

            if ($this->fieldChanged($enrollment, $field, $validated[$field])) {
                $errors[$field] = 'Não é possível alterar: existem cobranças baixadas vinculadas a esta matrícula.';
            }
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
    }

    private function fieldChanged(Enrollment $enrollment, string $field, mixed $newValue): bool
    {
        return match ($field) {
            'start_date' => $enrollment->start_date?->toDateString() !== (string) $newValue,
            'end_date' => ($enrollment->end_date?->toDateString() ?? null)
                !== (($newValue === null || $newValue === '') ? null : (string) $newValue),
            'monthly_amount' => $this->decimalChanged($enrollment->monthly_amount, $newValue),
            'discount_amount' => $this->decimalChanged($enrollment->discount_amount ?? 0, $newValue),
            default => false,
        };
    }

    private function decimalChanged(mixed $current, mixed $new): bool
    {
        return round((float) ($current ?? 0), 2) !== round((float) ($new ?? 0), 2);
    }
}

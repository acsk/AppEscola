<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Carbon\Carbon;

class UpdateEnrollmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'school_class_id' => ['sometimes', 'exists:school_classes,id'],
            'enrollment_number' => ['nullable', 'string', 'max:50'],
            'start_date' => ['sometimes', 'nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'status' => ['sometimes', 'exists:domain_enrollment_statuses,slug'],
            'monthly_amount' => ['nullable', 'numeric', 'min:0'],
            'discount_amount' => ['nullable', 'numeric', 'min:0'],
            'payment_due_day' => ['nullable', 'integer', 'min:1', 'max:28'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $merge = [];

        // Só normaliza datas enviadas no payload. Sem isso, merge de null
        // faz o "sometimes|date" falhar ao editar só a turma (datas bloqueadas).
        if ($this->exists('start_date')) {
            $merge['start_date'] = $this->normalizeDate($this->input('start_date'));
        }

        if ($this->exists('end_date')) {
            $merge['end_date'] = $this->normalizeDate($this->input('end_date'));
        }

        if ($merge !== []) {
            $this->merge($merge);
        }
    }

    private function normalizeDate(mixed $value): mixed
    {
        if (! is_string($value)) {
            return $value;
        }

        $value = trim($value);

        if ($value === '') {
            return null;
        }

        if (preg_match('/^\d{2}\/\d{2}\/\d{4}$/', $value)) {
            return Carbon::createFromFormat('d/m/Y', $value)->format('Y-m-d');
        }

        return $value;
    }
}

<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

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
            'start_date' => ['sometimes', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'status' => ['sometimes', 'exists:domain_enrollment_statuses,slug'],
            'monthly_amount' => ['nullable', 'numeric', 'min:0'],
            'discount_amount' => ['nullable', 'numeric', 'min:0'],
            'payment_due_day' => ['nullable', 'integer', 'min:1', 'max:28'],
        ];
    }
}

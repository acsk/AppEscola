<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateInvoiceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'enrollment_id' => ['nullable', 'exists:enrollments,id'],
            'guardian_id' => ['nullable', 'exists:guardians,id'],
            'description' => ['sometimes', 'string', 'max:255'],
            'amount' => ['sometimes', 'numeric', 'min:0.01'],
            'due_date' => ['sometimes', 'date'],
            'status' => ['sometimes', 'exists:domain_invoice_statuses,slug'],
            'paid_at' => ['nullable', 'date'],
            'payment_method' => ['nullable', 'exists:domain_payment_methods,slug'],
            'notes' => ['nullable', 'string'],
        ];
    }
}

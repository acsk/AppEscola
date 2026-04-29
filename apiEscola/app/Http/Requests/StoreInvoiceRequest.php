<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreInvoiceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'enrollment_id' => ['nullable', 'exists:enrollments,id'],
            'student_id' => ['required', 'exists:students,id'],
            'guardian_id' => ['nullable', 'exists:guardians,id'],
            'description' => ['required', 'string', 'max:255'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'due_date' => ['required', 'date'],
            'status' => ['nullable', 'exists:domain_invoice_statuses,slug'],
            'payment_method' => ['nullable', 'exists:domain_payment_methods,slug'],
            'notes' => ['nullable', 'string'],
        ];
    }
}

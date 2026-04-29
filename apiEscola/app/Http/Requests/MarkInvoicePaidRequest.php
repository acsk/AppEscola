<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class MarkInvoicePaidRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'paid_at' => ['nullable', 'date'],
            'payment_method' => ['required', 'exists:domain_payment_methods,slug'],
            'notes' => ['nullable', 'string'],
        ];
    }
}

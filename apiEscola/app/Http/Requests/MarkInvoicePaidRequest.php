<?php

namespace App\Http\Requests;

use App\Services\InvoiceSettlementService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

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
            'payment_reference' => ['nullable', 'string', 'max:120'],
            'notes' => ['nullable', 'string', 'max:500'],
            'environment' => ['nullable', 'string', 'in:stage,prod,production'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            $method = (string) $this->input('payment_method');
            $reference = trim((string) $this->input('payment_reference', ''));

            if (app(InvoiceSettlementService::class)->requiresPaymentReference($method) && $reference === '') {
                $validator->errors()->add(
                    'payment_reference',
                    'Informe o identificador da transação (NSU, autorização ou últimos dígitos + data).'
                );
            }
        });
    }
}

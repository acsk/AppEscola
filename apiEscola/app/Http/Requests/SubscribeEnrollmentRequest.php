<?php

namespace App\Http\Requests;

use App\Services\InvoiceSettlementService;
use Carbon\Carbon;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class SubscribeEnrollmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function messages(): array
    {
        return [
            'school_class_id.unique' => 'Este aluno já possui matrícula ativa nesta turma.',
        ];
    }

    public function rules(): array
    {
        return [
            'student_id'      => ['required', 'exists:students,id'],
            'school_class_id' => [
                'required',
                'exists:school_classes,id',
                Rule::unique('enrollments', 'school_class_id')
                    ->where('student_id', $this->student_id)
                    ->whereNotIn('status', ['cancelled'])
                    ->whereNull('deleted_at'),
            ],
            'course_plan_id'  => ['required', 'exists:course_plans,id'],
            'start_date'      => ['nullable', 'date'],
            'end_date'        => ['nullable', 'date', 'after_or_equal:start_date'],
            'discount_amount' => ['nullable', 'numeric', 'min:0'],
            'payment_due_day' => ['nullable', 'integer', 'min:1', 'max:28'],
            // Responsável financeiro para cobrança — se não informado, usa o marcado como financeiro na relação
            'guardian_id'     => ['nullable', 'exists:guardians,id'],
            // Pagamento no ato: taxa de matrícula OU 1ª mensalidade (plano sem taxa)
            'enrollment_payment'                 => ['nullable', 'array'],
            'enrollment_payment.payment_method'     => ['nullable', 'string', 'exists:domain_payment_methods,slug'],
            'enrollment_payment.paid_at'            => ['nullable', 'date'],
            'enrollment_payment.payment_reference'  => ['nullable', 'string', 'max:120'],
            'enrollment_payment.notes'              => ['nullable', 'string', 'max:500'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $payment = $this->input('enrollment_payment');

        if (is_array($payment)) {
            $payment['paid_at'] = $this->normalizeDate($payment['paid_at'] ?? null);
        }

        $this->merge([
            'start_date' => $this->normalizeDate($this->input('start_date')),
            'end_date' => $this->normalizeDate($this->input('end_date')),
            'enrollment_payment' => $payment,
        ]);
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

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            $payment = $this->input('enrollment_payment');

            if (! is_array($payment) || empty($payment['payment_method'])) {
                return;
            }

            $method = (string) $payment['payment_method'];
            $reference = trim((string) ($payment['payment_reference'] ?? ''));

            if (app(InvoiceSettlementService::class)->requiresPaymentReference($method) && $reference === '') {
                $validator->errors()->add(
                    'enrollment_payment.payment_reference',
                    'Informe o identificador da transação no cartão de crédito.'
                );
            }
        });
    }
}

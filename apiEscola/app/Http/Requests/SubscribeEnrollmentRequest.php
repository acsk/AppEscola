<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SubscribeEnrollmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'student_id'      => ['required', 'exists:students,id'],
            'school_class_id' => ['required', 'exists:school_classes,id'],
            'course_plan_id'  => ['required', 'exists:course_plans,id'],
            'start_date'      => ['required', 'date'],
            'end_date'        => ['nullable', 'date', 'after_or_equal:start_date'],
            'discount_amount' => ['nullable', 'numeric', 'min:0'],
            'payment_due_day' => ['nullable', 'integer', 'min:1', 'max:28'],
            // Responsável financeiro para cobrança — se não informado, usa o marcado como financeiro na relação
            'guardian_id'     => ['nullable', 'exists:guardians,id'],
            // Pagamento da taxa de matrícula (cobrada no ato da matrícula)
            'enrollment_payment'                 => ['nullable', 'array'],
            'enrollment_payment.payment_method'  => ['nullable', 'string', 'exists:domain_payment_methods,slug'],
            'enrollment_payment.paid_at'         => ['nullable', 'date'],
            'enrollment_payment.notes'           => ['nullable', 'string', 'max:500'],
        ];
    }
}

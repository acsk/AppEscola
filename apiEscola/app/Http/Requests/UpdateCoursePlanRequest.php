<?php

namespace App\Http\Requests;

use App\Models\CoursePlan;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCoursePlanRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name'          => ['sometimes', 'string', 'max:255'],
            'billing_cycle' => ['sometimes', Rule::in(array_keys(CoursePlan::CYCLE_MONTHS))],
            'price'         => ['sometimes', 'numeric', 'min:0.01'],
            'enrollment_fee_amount' => ['nullable', 'numeric', 'min:0'],
            'status'        => ['sometimes', Rule::in(['active', 'inactive'])],
        ];
    }
}

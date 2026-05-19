<?php

namespace App\Http\Requests;

use App\Models\CoursePlan;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreCoursePlanRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name'          => ['required', 'string', 'max:255'],
            'billing_cycle' => ['required', Rule::in(array_keys(CoursePlan::CYCLE_MONTHS))],
            'price'         => ['required', 'numeric', 'min:0.01'],
            'enrollment_fee_amount' => ['nullable', 'numeric', 'min:0'],
            'status'        => ['nullable', Rule::in(['active', 'inactive'])],
        ];
    }
}

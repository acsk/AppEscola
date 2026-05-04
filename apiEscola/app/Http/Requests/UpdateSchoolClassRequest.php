<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateSchoolClassRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'course_id' => ['sometimes', 'exists:courses,id'],
            'name'      => ['sometimes', 'string', 'max:255'],
            'year'      => ['nullable', 'integer', 'min:2000', 'max:2100'],
            'period'    => ['nullable', 'exists:domain_periods,slug'],
            'capacity'  => ['nullable', 'integer', 'min:1'],
            'start_date'=> ['sometimes', 'date'],
            'end_date'  => ['sometimes', 'date', 'after:start_date'],
            'status'    => ['nullable', 'exists:domain_statuses,slug'],
        ];
    }
}

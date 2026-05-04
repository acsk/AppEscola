<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreSchoolClassRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'course_id' => ['required', 'exists:courses,id'],
            'name'      => ['required', 'string', 'max:255'],
            'year'      => ['nullable', 'integer', 'min:2000', 'max:2100'],
            'period'    => ['nullable', 'exists:domain_periods,slug'],
            'capacity'  => ['nullable', 'integer', 'min:1'],
            'start_date'=> ['required', 'date'],
            'end_date'  => ['required', 'date', 'after:start_date'],
            'status'    => ['nullable', 'exists:domain_statuses,slug'],
        ];
    }
}

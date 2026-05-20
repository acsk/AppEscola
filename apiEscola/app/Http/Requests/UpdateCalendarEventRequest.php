<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCalendarEventRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $types = array_keys(config('calendar_events.types', []));

        return [
            'type'            => ['sometimes', 'string', Rule::in($types)],
            'title'           => ['sometimes', 'string', 'max:255'],
            'description'     => ['nullable', 'string', 'max:5000'],
            'starts_at'       => ['sometimes', 'date'],
            'ends_at'         => ['nullable', 'date', 'after_or_equal:starts_at'],
            'all_day'         => ['sometimes', 'boolean'],
            'course_id'       => ['nullable', 'integer', 'exists:courses,id'],
            'school_class_id' => ['nullable', 'integer', 'exists:school_classes,id'],
            'location'        => ['nullable', 'string', 'max:255'],
            'audience_type'   => ['sometimes', 'string', Rule::in(config('calendar_events.audience_types', []))],
            'is_published'    => ['sometimes', 'boolean'],
        ];
    }
}

<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreCalendarEventRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $types = array_keys(config('calendar_events.types', []));
        $audiences = config('calendar_events.audience_types', []);

        return [
            'type'            => ['required', 'string', Rule::in($types)],
            'title'           => ['required', 'string', 'max:255'],
            'description'     => ['nullable', 'string', 'max:5000'],
            'starts_at'       => ['required', 'date'],
            'ends_at'         => ['nullable', 'date', 'after_or_equal:starts_at'],
            'all_day'         => ['sometimes', 'boolean'],
            'course_id'       => ['nullable', 'integer', 'exists:courses,id'],
            'school_class_id' => ['nullable', 'integer', 'exists:school_classes,id'],
            'location'        => ['nullable', 'string', 'max:255'],
            'audience_type'   => ['required', 'string', Rule::in($audiences)],
            'is_published'    => ['sometimes', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'type.required'      => 'O tipo do evento é obrigatório.',
            'title.required'     => 'O título é obrigatório.',
            'starts_at.required' => 'A data de início é obrigatória.',
            'ends_at.after_or_equal' => 'A data final deve ser igual ou posterior ao início.',
        ];
    }
}

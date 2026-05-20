<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateNotificationCalendarSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $types = array_keys(config('student_notifications.types', []));

        return [
            'calendar_enabled_types'   => ['required', 'array'],
            'calendar_enabled_types.*' => ['string', Rule::in($types)],
        ];
    }

    public function messages(): array
    {
        return [
            'calendar_enabled_types.required' => 'Informe ao menos a lista de tipos (pode ser vazia).',
            'calendar_enabled_types.*.in'       => 'Tipo de notificação inválido.',
        ];
    }

    /**
     * @return list<string>
     */
    public function calendarEnabledTypes(): array
    {
        return array_values($this->input('calendar_enabled_types', []));
    }
}

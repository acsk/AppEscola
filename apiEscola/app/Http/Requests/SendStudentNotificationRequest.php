<?php

namespace App\Http\Requests;

use App\Models\Tenant;
use App\Services\TenantNotificationSettingsService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class SendStudentNotificationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $types = array_keys(config('student_notifications.types', []));
        $audiences = config('student_notifications.audience_types', []);

        return [
            'type'             => ['required', 'string', Rule::in($types)],
            'title'            => ['required', 'string', 'max:255'],
            'body'             => ['required', 'string', 'max:5000'],
            'audience_type'    => ['required', 'string', Rule::in($audiences)],
            'course_id'        => ['required_if:audience_type,course', 'nullable', 'integer', 'exists:courses,id'],
            'school_class_id'  => ['required_if:audience_type,school_class', 'nullable', 'integer', 'exists:school_classes,id'],
            'student_id'       => ['required_if:audience_type,student', 'nullable', 'integer', 'exists:students,id'],
            'student_ids'      => ['required_if:audience_type,students', 'nullable', 'array', 'min:1'],
            'student_ids.*'    => ['integer', 'exists:students,id'],
            'data'             => ['nullable', 'array'],
            'data.exam_id'     => ['nullable', 'integer', 'exists:exams,id'],
            'data.invoice_id'  => ['nullable', 'integer', 'exists:invoices,id'],
            'data.action'      => ['nullable', 'string', 'max:50'],
            'show_on_calendar' => ['sometimes', 'boolean'],
            'starts_at'        => ['required_if:show_on_calendar,true', 'nullable', 'date'],
            'ends_at'          => ['required_if:show_on_calendar,true', 'nullable', 'date', 'after_or_equal:starts_at'],
        ];
    }

    public function messages(): array
    {
        return [
            'type.required'          => 'O tipo da notificação é obrigatório.',
            'title.required'         => 'O título é obrigatório.',
            'body.required'          => 'A mensagem é obrigatória.',
            'audience_type.required' => 'O público-alvo é obrigatório.',
            'course_id.required_if'  => 'Informe o curso para este público.',
            'school_class_id.required_if' => 'Informe a turma para este público.',
            'student_id.required_if' => 'Informe o aluno para este público.',
            'student_ids.required_if'=> 'Informe ao menos um aluno.',
            'starts_at.required_if'  => 'Informe a data de início para exibir no calendário.',
            'ends_at.required_if'    => 'Informe a data de fim para exibir no calendário.',
            'ends_at.after_or_equal' => 'A data final deve ser igual ou posterior ao início.',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if (! $this->showOnCalendar()) {
                return;
            }

            $user = $this->user();
            if (! $user?->tenant_id) {
                return;
            }

            $tenant = Tenant::find((int) $user->tenant_id);
            if (! $tenant) {
                return;
            }

            $type = (string) $this->input('type');
            $settings = app(TenantNotificationSettingsService::class);

            if (! $settings->isCalendarEnabledForType($tenant, $type)) {
                $validator->errors()->add(
                    'show_on_calendar',
                    'Este tipo de notificação não está habilitado para aparecer no calendário. Ajuste em Notificações → Configurações.'
                );
            }
        });
    }

    public function showOnCalendar(): bool
    {
        return $this->boolean('show_on_calendar');
    }

    /**
     * @return array<string, mixed>
     */
    public function audienceParams(): array
    {
        return match ($this->input('audience_type')) {
            'course'        => ['course_id' => (int) $this->input('course_id')],
            'school_class'  => ['school_class_id' => (int) $this->input('school_class_id')],
            'student'       => ['student_id' => (int) $this->input('student_id')],
            'students'      => ['student_ids' => array_map('intval', $this->input('student_ids', []))],
            default         => [],
        };
    }
}

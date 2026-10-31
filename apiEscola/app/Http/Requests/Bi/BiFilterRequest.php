<?php

namespace App\Http\Requests\Bi;

use App\Services\Bi\BiFilters;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Filtros globais do BI. Todo id é conferido contra o tenant da requisição. */
class BiFilterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $tenantId = (int) $this->input('_tenant_id');
        $inTenant = fn (string $table) => Rule::exists($table, 'id')
            ->where('tenant_id', $tenantId)
            ->whereNull('deleted_at');
        $maxDays = (int) config('bi.max_period_days', 731);

        return [
            'from' => ['nullable', 'date_format:Y-m-d', 'required_with:to'],
            'to' => [
                'nullable', 'date_format:Y-m-d', 'required_with:from', 'after_or_equal:from',
                function (string $attribute, mixed $value, \Closure $fail) use ($maxDays) {
                    $from = $this->input('from');
                    if ($from && $value && (strtotime($value) - strtotime($from)) / 86400 > $maxDays) {
                        $fail("O período pode ter no máximo {$maxDays} dias.");
                    }
                },
            ],
            'school_year' => ['nullable', 'integer', 'between:2000,2100'],
            'course_id' => ['nullable', 'integer', $inTenant('courses')],
            'school_class_id' => ['nullable', 'integer', $inTenant('school_classes')],
            'subject_id' => ['nullable', 'integer', $inTenant('subjects')],
            'teacher_id' => [
                'nullable', 'integer',
                Rule::exists('users', 'id')->where('tenant_id', $tenantId)->where('role', 'professor')->whereNull('deleted_at'),
            ],
            'exam_type_id' => ['nullable', 'integer', Rule::exists('exam_types', 'id')],
            'modality' => ['nullable', 'string', Rule::in(BiFilters::MODALITIES)],
        ];
    }

    public function messages(): array
    {
        return [
            'to.after_or_equal' => 'A data final deve ser igual ou posterior à data inicial.',
            '*.exists' => 'Valor não encontrado nesta escola.',
        ];
    }
}

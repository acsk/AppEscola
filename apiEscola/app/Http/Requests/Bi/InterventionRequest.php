<?php

namespace App\Http\Requests\Bi;

use App\Models\PedagogicalIntervention;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Criação (POST) e edição parcial (PUT) de intervenção; ids conferidos contra o tenant. */
class InterventionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $tenantId = (int) $this->input('_tenant_id');
        $creating = $this->isMethod('post');
        $req = $creating ? 'required' : 'sometimes';
        $inTenant = fn (string $table) => Rule::exists($table, 'id')->where('tenant_id', $tenantId);

        return [
            'student_ids' => [$creating ? 'required' : 'prohibited', 'array', 'min:1', 'max:200'],
            'student_ids.*' => ['integer', 'distinct', $inTenant('students')->whereNull('deleted_at')],
            'type' => [$req, Rule::in(array_keys(PedagogicalIntervention::TYPES))],
            'title' => ['nullable', 'string', 'max:150'],
            'reason_code' => [$req, Rule::in(array_keys(PedagogicalIntervention::REASONS))],
            'reason_detail' => ['nullable', 'string', 'max:255'],
            'subject_id' => [$creating ? 'nullable' : 'prohibited', 'integer', $inTenant('subjects')->whereNull('deleted_at')],
            'subject_topic_id' => ['nullable', 'integer', $inTenant('subject_topics')],
            'school_class_id' => [$creating ? 'nullable' : 'prohibited', 'integer', $inTenant('school_classes')->whereNull('deleted_at')],
            'responsible_user_id' => ['nullable', 'integer', Rule::exists('users', 'id')->where('tenant_id', $tenantId)->whereIn('role', ['admin', 'coordenador', 'professor', 'secretaria'])->whereNull('deleted_at')],
            'starts_on' => [$creating ? 'required' : 'prohibited', 'date_format:Y-m-d'],
            'reassess_on' => ['nullable', 'date_format:Y-m-d', $creating ? 'after_or_equal:starts_on' : 'date'],
            'status' => [
                'sometimes',
                Rule::in($creating
                    ? [PedagogicalIntervention::STATUS_PLANNED, PedagogicalIntervention::STATUS_IN_PROGRESS]
                    : [PedagogicalIntervention::STATUS_PLANNED, PedagogicalIntervention::STATUS_IN_PROGRESS, PedagogicalIntervention::STATUS_REASSESSMENT, PedagogicalIntervention::STATUS_CANCELLED]),
            ],
            'note' => ['nullable', 'string', 'max:2000'],
        ];
    }

    public function messages(): array
    {
        return [
            '*.exists' => 'Valor não encontrado nesta escola.',
            'student_ids.*.exists' => 'Aluno não encontrado nesta escola.',
            'responsible_user_id.exists' => 'Responsável deve ser alguém da equipe desta escola.',
            'reassess_on.after_or_equal' => 'A reavaliação deve ser no início ou depois dele.',
            'status.in' => 'Para concluir, use "Registrar reavaliação".',
        ];
    }
}

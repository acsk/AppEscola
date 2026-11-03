<?php

namespace App\Http\Requests\Bi;

use App\Services\Bi\BiCriteria;
use Illuminate\Foundation\Http\FormRequest;

/** Critérios pedagógicos da escola; envio parcial atualiza só os campos informados. */
class BiCriteriaRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $rules = [];
        foreach (BiCriteria::FIELDS as $key => [$min, $max, $integer]) {
            $rules[$key] = ['sometimes', $integer ? 'integer' : 'numeric', "between:{$min},{$max}"];
        }
        $rules['ai_enabled'] = ['sometimes', 'boolean'];

        return $rules;
    }

    public function attributes(): array
    {
        return [
            'goal_pct' => 'meta de aproveitamento',
            'evolution_threshold_pp' => 'variação mínima de evolução',
            'attendance_alert_below' => 'frequência mínima',
            'dedication_days_per_week' => 'dias ativos por semana',
            'profile_min_assessments' => 'avaliações mínimas',
            'profile_min_questions' => 'questões mínimas',
        ];
    }
}

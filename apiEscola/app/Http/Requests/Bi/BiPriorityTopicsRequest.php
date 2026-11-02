<?php

namespace App\Http\Requests\Bi;

use App\Services\Bi\PriorityTopics;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Assuntos prioritários de um concurso: lista completa (o que ficar de fora deixa de ser prioritário). */
class BiPriorityTopicsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $tenantId = (int) $this->input('_tenant_id');

        return [
            'topics' => ['present', 'array', 'max:2000'],
            'topics.*.topic_id' => ['required', 'integer', 'distinct', Rule::exists('subject_topics', 'id')->where('tenant_id', $tenantId)],
            'topics.*.weight' => ['required', 'integer', 'between:0,'.PriorityTopics::MAX_WEIGHT],
        ];
    }

    public function messages(): array
    {
        return ['topics.*.topic_id.exists' => 'Assunto não encontrado nesta escola.'];
    }
}

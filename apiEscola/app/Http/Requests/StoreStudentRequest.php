<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreStudentRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $payload = $this->all();

        if (array_key_exists('document', $payload)) {
            $payload['document'] = $this->normalizeDocument($payload['document']);
        }

        if (isset($payload['guardians']) && is_array($payload['guardians'])) {
            $payload['guardians'] = array_map(function ($guardian) {
                if (! is_array($guardian)) {
                    return $guardian;
                }

                if (array_key_exists('document', $guardian)) {
                    $guardian['document'] = $this->normalizeDocument($guardian['document']);
                }

                return $guardian;
            }, $payload['guardians']);
        }

        $this->replace($payload);
    }

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'user_id'    => ['nullable', 'exists:users,id'],
            'name'       => ['required', 'string', 'max:255'],
            'birth_date' => ['nullable', 'date', 'before:today'],
            'document'   => ['nullable', 'string', 'max:20', Rule::unique('students', 'document')->where('tenant_id', $this->user()->tenant_id)],
            'email'      => ['nullable', 'email', 'max:255', Rule::unique('students', 'email')->where('tenant_id', $this->user()->tenant_id)],
            'phone'      => ['nullable', 'string', 'max:20'],
            'is_minor'   => ['nullable', 'boolean'],
            'status'     => ['nullable', 'exists:domain_statuses,slug'],

            // Responsáveis (opcional — podem ser criados junto com o aluno)
            'guardians'                             => ['nullable', 'array'],
            'guardians.*.guardian_id'               => ['nullable', 'exists:guardians,id'],
            'guardians.*.name'                      => ['required_without:guardians.*.guardian_id', 'nullable', 'string', 'max:255'],
            'guardians.*.document'                  => [
                'required_without:guardians.*.guardian_id',
                'nullable',
                'string',
                'max:20',
                'distinct',
                Rule::unique('guardians', 'document')->where('tenant_id', $this->user()->tenant_id),
            ],
            'guardians.*.email'                     => ['required_without:guardians.*.guardian_id', 'nullable', 'email', 'max:255'],
            'guardians.*.phone'                     => ['nullable', 'string', 'max:20'],
            'guardians.*.relationship'              => ['nullable', 'exists:domain_guardian_relationships,slug'],
            'guardians.*.is_financial_responsible'  => ['nullable', 'boolean'],
            'guardians.*.is_pedagogical_responsible'=> ['nullable', 'boolean'],
            'guardians.*.can_access_portal'         => ['nullable', 'boolean'],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator) {
                $guardians = $this->input('guardians', []);
                $financialCount = collect($guardians)
                    ->filter(fn ($g) => !empty($g['is_financial_responsible']))
                    ->count();

                if ($financialCount > 1) {
                    $validator->errors()->add('guardians', 'Apenas um responsável financeiro pode ser definido.');
                }

                if ($this->boolean('is_minor') && !empty($guardians) && $financialCount === 0) {
                    $validator->errors()->add('guardians', 'Aluno menor deve ter pelo menos um responsável financeiro.');
                }
            },
        ];
    }

    public function messages(): array
    {
        return [
            'guardians.*.document.required_without' => 'Informe o CPF do responsável quando ele não estiver previamente cadastrado.',
            'guardians.*.document.distinct' => 'Não repita o mesmo CPF entre os responsáveis informados.',
            'guardians.*.document.unique' => 'Já existe um responsável com este CPF.',
            'guardians.*.email.required_without' => 'Informe o e-mail do responsável quando ele não estiver previamente cadastrado.',
        ];
    }

    public function attributes(): array
    {
        return [
            'guardians.*.document' => 'CPF do responsável',
            'guardians.*.email' => 'e-mail do responsável',
        ];
    }

    private function normalizeDocument($value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $digits = preg_replace('/\D+/', '', $value) ?? '';

        return $digits !== '' ? $digits : null;
    }
}

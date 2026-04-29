<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class UpdateStudentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'user_id'    => ['nullable', 'exists:users,id'],
            'name'       => ['sometimes', 'string', 'max:255'],
            'birth_date' => ['nullable', 'date', 'before:today'],
            'document'   => ['nullable', 'string', 'max:20', Rule::unique('students', 'document')->where('tenant_id', $this->user()->tenant_id)->ignore($this->route('student'))],
            'email'      => ['nullable', 'email', 'max:255', Rule::unique('students', 'email')->where('tenant_id', $this->user()->tenant_id)->ignore($this->route('student'))],
            'phone'      => ['nullable', 'string', 'max:20'],
            'is_minor'   => ['nullable', 'boolean'],
            'status'     => ['nullable', 'exists:domain_statuses,slug'],

            // Quando enviado, substitui toda a lista de responsáveis do aluno
            'guardians'                             => ['nullable', 'array'],
            'guardians.*.guardian_id'               => ['nullable', 'exists:guardians,id'],
            'guardians.*.name'                      => ['required_without:guardians.*.guardian_id', 'nullable', 'string', 'max:255'],
            'guardians.*.document'                  => ['nullable', 'string', 'max:20'],
            'guardians.*.email'                     => ['nullable', 'email', 'max:255'],
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
            },
        ];
    }
}

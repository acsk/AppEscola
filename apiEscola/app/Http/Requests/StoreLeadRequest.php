<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreLeadRequest extends FormRequest
{
    /** Opções do formulário do site (site/src/sections/LeadForm.tsx) — manter em sincronia. */
    public const ROLES = ['Diretor(a) ou proprietário(a)', 'Coordenador(a)', 'Secretaria / financeiro', 'Professor(a)'];

    public const STUDENTS_RANGES = ['Até 100', '101 a 300', '301 a 1.000', 'Mais de 1.000'];

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $phone = preg_replace('/\D+/', '', (string) $this->input('phone', '')) ?? '';

        $this->merge([
            'name' => trim((string) $this->input('name', '')),
            'email' => trim((string) $this->input('email', '')),
            'phone' => $phone,
            'institution' => trim((string) $this->input('institution', '')),
            'role' => trim((string) $this->input('role', '')) ?: null,
            'students_range' => trim((string) $this->input('students_range', '')) ?: null,
            'message' => trim((string) $this->input('message', '')) ?: null,
        ]);
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:160'],
            'phone' => ['required', 'regex:/^\d{10,15}$/'],
            'institution' => ['required', 'string', 'max:160'],
            'role' => ['nullable', 'string', Rule::in(self::ROLES)],
            'students_range' => ['nullable', 'string', Rule::in(self::STUDENTS_RANGES)],
            'message' => ['nullable', 'string', 'max:1000'],
            'company_website' => ['nullable', 'string', 'max:200'],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'Informe seu nome.',
            'email.required' => 'Informe seu e-mail.',
            'email.email' => 'Informe um e-mail válido.',
            'phone.required' => 'Informe seu telefone.',
            'phone.regex' => 'Informe um telefone com DDD.',
            'institution.required' => 'Informe o nome do cursinho.',
            'role.in' => 'Selecione um cargo válido.',
            'students_range.in' => 'Selecione uma faixa de alunos válida.',
            'message.max' => 'A mensagem pode ter no máximo 1000 caracteres.',
        ];
    }
}

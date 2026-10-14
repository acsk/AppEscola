<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreLeadRequest extends FormRequest
{
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
            'message.max' => 'A mensagem pode ter no máximo 1000 caracteres.',
        ];
    }
}

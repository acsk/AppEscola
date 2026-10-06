<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** PUT /ai-settings/{provider}: api_key ausente/vazia mantém a chave atual (só troca modelo/ativo). */
class SaveTenantAiCredentialRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'api_key' => ['sometimes', 'nullable', 'string', 'min:20', 'max:500', 'regex:/^\S+$/'],
            'model'   => ['sometimes', 'nullable', 'string', 'max:120', 'regex:/^[A-Za-z0-9._:\/\-]+$/'],
            'active'  => ['sometimes', 'boolean'],
        ];
    }

    public function attributes(): array
    {
        return [
            'api_key' => 'chave de API',
            'model'   => 'modelo',
            'active'  => 'ativo',
        ];
    }

    public function messages(): array
    {
        return [
            'api_key.regex' => 'A chave de API não pode conter espaços.',
            'model.regex'   => 'Modelo inválido (use o identificador do provedor, ex.: openai/gpt-4o-mini).',
        ];
    }
}

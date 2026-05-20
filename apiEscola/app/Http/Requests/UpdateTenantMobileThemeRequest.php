<?php

namespace App\Http\Requests;

use App\Services\TenantMobileThemeService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateTenantMobileThemeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $templateIds = array_keys((array) config('tenant_mobile_theme.templates', []));
        $colorKeys = app(TenantMobileThemeService::class)->colorKeys();

        $hexOrRgba = ['nullable', 'string', 'max:32'];

        $rules = [
            'template_id' => ['sometimes', 'string', Rule::in($templateIds)],
            'colors'      => ['sometimes', 'array'],
            'clear_overrides' => ['sometimes', 'boolean'],
        ];

        foreach ($colorKeys as $key) {
            $rules["colors.{$key}"] = $hexOrRgba;
        }

        return $rules;
    }

    public function messages(): array
    {
        return [
            'template_id.in' => 'Template de cores inválido.',
            'colors.*.max'   => 'Valor de cor muito longo.',
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            if (! $this->filled('template_id') && ! $this->filled('colors')) {
                $validator->errors()->add('template_id', 'Informe template_id e/ou colors.');
            }

            $colors = $this->input('colors');
            if (! is_array($colors)) {
                return;
            }

            $hasValue = false;
            foreach ($colors as $value) {
                if ($value !== null && trim((string) $value) !== '') {
                    $hasValue = true;
                    break;
                }
            }

            if ($this->filled('colors') && ! $hasValue && ! $this->filled('template_id')) {
                $validator->errors()->add('colors', 'Informe ao menos uma cor válida em colors.');
            }
        });
    }

    public function templateId(): ?string
    {
        $id = $this->input('template_id');

        return is_string($id) && trim($id) !== '' ? trim($id) : null;
    }

    /**
     * @return array<string, string>
     */
    public function colorsInput(): array
    {
        $colors = $this->input('colors', []);

        return is_array($colors) ? $colors : [];
    }

    public function shouldClearOverrides(): bool
    {
        return $this->boolean('clear_overrides');
    }
}

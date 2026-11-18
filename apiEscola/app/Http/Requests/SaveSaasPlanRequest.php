<?php

namespace App\Http\Requests;

use App\Services\Saas\TenantQuotaService;
use Illuminate\Foundation\Http\FormRequest;

class SaveSaasPlanRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->isSuperAdmin();
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'billing_basis' => $this->input('billing_basis', 'flat'),
            'offer_gestao' => $this->has('offer_gestao') ? $this->boolean('offer_gestao') : false,
        ]);
    }

    public function rules(): array
    {
        $limitRules = [];
        foreach (array_keys(TenantQuotaService::RESOURCES) as $resource) {
            $limitRules["limits.{$resource}"] = ['nullable', 'integer', 'min:0', 'max:10000000'];
        }

        return [
            'name' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:2000'],
            'price_monthly' => ['required', 'numeric', 'min:0', 'max:9999999'],
            'price_yearly' => ['nullable', 'numeric', 'min:0', 'max:99999999'],
            'billing_basis' => ['required', 'in:flat,per_student'],
            'offer_gestao' => ['required', 'boolean'],
            'gestao_price_monthly' => ['nullable', 'numeric', 'min:0', 'max:9999999'],
            'price_schedule' => ['nullable', 'array', 'max:24'],
            'price_schedule.*.from' => ['required', 'date_format:Y-m-d'],
            'price_schedule.*.until' => ['nullable', 'date_format:Y-m-d'],
            'price_schedule.*.price' => ['required', 'numeric', 'min:0', 'max:9999999'],
            'trial_days' => ['required', 'integer', 'min:0', 'max:365'],
            'status' => ['required', 'in:active,inactive'],
            'order' => ['nullable', 'integer', 'min:0', 'max:999'],
            'limits' => ['nullable', 'array'],
            'features' => ['nullable', 'array'],
            'features.*' => ['string', 'exists:saas_features,key'],
        ] + $limitRules;
    }

    public function attributes(): array
    {
        return [
            'name' => 'nome',
            'price_monthly' => 'preço mensal',
            'price_yearly' => 'preço anual',
            'billing_basis' => 'forma de cobrança',
            'offer_gestao' => 'módulo gestão',
            'gestao_price_monthly' => 'valor da gestão',
            'price_schedule' => 'faixa de preço',
            'trial_days' => 'dias de teste',
        ];
    }
}

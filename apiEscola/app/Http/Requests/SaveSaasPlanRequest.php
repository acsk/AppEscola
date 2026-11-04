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
        return ['name' => 'nome', 'price_monthly' => 'preço mensal', 'price_yearly' => 'preço anual', 'trial_days' => 'dias de teste'];
    }
}

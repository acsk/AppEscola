<?php

namespace App\Services;

use App\Models\Tenant;
use App\Models\TenantSetting;
use App\Models\DomainPaymentMethod;
use Illuminate\Support\Facades\Cache;
use InvalidArgumentException;

class TenantBillingSettingsService
{
    private const CACHE_TTL_SECONDS = 600;

    /**
     * Descrições longas para exibição no painel por escopo.
     *
     * @var array<string, string>
     */
    private const SCOPE_DESCRIPTIONS = [
        'billing' => 'Defina como as cobrancas sao geradas: taxa de matricula, integracao com a primeira mensalidade, antecipacao de mensalidades e dia padrao de vencimento.',
        'payment' => 'Escolha o provedor padrao, o metodo de cobranca preferencial, quais formas de pagamento aceitar e se as cobrancas devem ser sincronizadas automaticamente com o provedor.',
        'enrollment' => 'Configure as validacoes obrigatorias durante o cadastro do aluno, como exigencia de CPF do pagador e responsavel financeiro para menores de idade.',
    ];

    /** @var array<string, array<string, array<string, mixed>>>|null */
    private ?array $schemaCache = null;

    /**
     * @return array<string, array<string, array<string, mixed>>>
     */
    public function schema(): array
    {
        if ($this->schemaCache === null) {
            $this->schemaCache = (array) config('tenant_billing_settings', []);
        }

        return $this->schemaCache;
    }

    /**
     * Schema ajustado ao tenant (ex.: métodos de pagamento filtrados por provedor selecionado).
     *
     * @return array<string, array<string, array<string, mixed>>>
     */
    public function schemaForTenant(Tenant $tenant): array
    {
        $schema = $this->schema();
        $selectedProvider = strtolower((string) ($this->get($tenant, 'payment', 'default_provider') ?? 'cora'));
        $providerMethods = $this->providerSupportedMethods($selectedProvider);

        if (
            isset($schema['payment']['enabled_methods']['options'])
            && is_array($schema['payment']['enabled_methods']['options'])
        ) {
            $current = array_values(array_map('strval', $schema['payment']['enabled_methods']['options']));
            $filtered = array_values(array_intersect($current, $providerMethods));
            if (! empty($filtered)) {
                $schema['payment']['enabled_methods']['options'] = $filtered;
            }
        }

        if (
            isset($schema['payment']['default_method']['options'])
            && is_array($schema['payment']['default_method']['options'])
        ) {
            $current = array_values(array_map('strval', $schema['payment']['default_method']['options']));
            $filtered = array_values(array_intersect($current, $providerMethods));
            if (! empty($filtered)) {
                $schema['payment']['default_method']['options'] = $filtered;

                $default = (string) ($schema['payment']['default_method']['default'] ?? '');
                if ($default === '' || ! in_array($default, $filtered, true)) {
                    $schema['payment']['default_method']['default'] = $filtered[0];
                }
            }
        }

        return $schema;
    }

    /**
     * @return array<string, string>
     */
    public function scopeDescriptions(): array
    {
        return self::SCOPE_DESCRIPTIONS;
    }

    /**
     * Defaults extraídos do schema, agrupados por escopo (módulo).
     *
     * @return array<string, array<string, mixed>>
     */
    public function defaults(): array
    {
        $defaults = [];
        foreach ($this->schema() as $scope => $keys) {
            $defaults[$scope] = [];
            foreach ($keys as $key => $meta) {
                $defaults[$scope][$key] = $meta['default'] ?? null;
            }
        }

        return $defaults;
    }

    /**
     * Defaults extraídos do schema já filtrado para o tenant/provedor.
     *
     * @return array<string, array<string, mixed>>
     */
    public function defaultsForTenant(Tenant $tenant): array
    {
        $schema = $this->schemaForTenant($tenant);
        $defaults = [];

        foreach ($schema as $scope => $keys) {
            $defaults[$scope] = [];
            foreach ($keys as $key => $meta) {
                $defaults[$scope][$key] = $meta['default'] ?? null;
            }
        }

        return $defaults;
    }

    /**
     * Retorna todas as configs do tenant (todos os módulos) mescladas com defaults.
     *
     * @return array<string, array<string, mixed>>
     */
    public function all(Tenant $tenant): array
    {
        return Cache::remember(
            $this->cacheKey($tenant->id),
            self::CACHE_TTL_SECONDS,
            fn () => $this->resolve($tenant)
        );
    }

    /**
     * Retorna todas as configurações com metadados por chave.
     *
     * @return array<string, array<string, array<string, mixed>>>
     */
    public function allWithMeta(Tenant $tenant): array
    {
        return Cache::remember(
            $this->cacheKey($tenant->id) . ':meta',
            self::CACHE_TTL_SECONDS,
            fn () => $this->resolveWithMeta($tenant)
        );
    }

    /**
     * Retorna somente o que está persistido na tabela tenant_settings (sem defaults).
     *
     * @return array<string, array<string, array<string, mixed>>>
     */
    public function persistedAll(Tenant $tenant): array
    {
        return Cache::remember(
            $this->cacheKey($tenant->id) . ':persisted',
            self::CACHE_TTL_SECONDS,
            fn () => $this->resolvePersisted($tenant)
        );
    }

    /**
     * Retorna somente os valores persistidos (sem metadados), para consumo direto no form.
     *
     * @return array<string, array<string, mixed>>
     */
    public function persistedAllValues(Tenant $tenant): array
    {
        $persisted = $this->persistedAll($tenant);
        $values = [];

        foreach ($persisted as $scope => $keys) {
            foreach ($keys as $key => $meta) {
                $values[$scope][$key] = $meta['value'] ?? null;
            }
        }

        return $values;
    }

    /**
     * @return array<string, mixed>
     */
    public function scope(Tenant $tenant, string $scope): array
    {
        $this->assertScope($scope);

        return $this->all($tenant)[$scope] ?? [];
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    public function scopeWithMeta(Tenant $tenant, string $scope): array
    {
        $this->assertScope($scope);

        return $this->allWithMeta($tenant)[$scope] ?? [];
    }

    /**
     * Retorna apenas os registros persistidos de um escopo na tenant_settings.
     *
     * @return array<string, array<string, mixed>>
     */
    public function persistedScope(Tenant $tenant, string $scope): array
    {
        $this->assertScope($scope);

        return $this->persistedAll($tenant)[$scope] ?? [];
    }

    /**
     * Retorna somente os valores persistidos (sem metadados) de um escopo.
     *
     * @return array<string, mixed>
     */
    public function persistedScopeValues(Tenant $tenant, string $scope): array
    {
        $this->assertScope($scope);

        $persisted = $this->persistedScope($tenant, $scope);
        $values = [];

        foreach ($persisted as $key => $meta) {
            $values[$key] = $meta['value'] ?? null;
        }

        return $values;
    }

    public function get(Tenant $tenant, string $scope, string $key): mixed
    {
        $this->assertKey($scope, $key);

        return $this->scope($tenant, $scope)[$key] ?? null;
    }

    /**
     * Atualiza várias chaves de um módulo em lote.
     *
     * @param  array<string, mixed>  $values
     * @return array<string, mixed>
     */
    public function updateScope(Tenant $tenant, string $scope, array $values): array
    {
        $this->assertScope($scope);

        foreach ($values as $key => $value) {
            $this->assertKey($scope, $key);
            $normalized  = $this->castAndValidate($scope, $key, $value);
            $description = (string) ($this->schema()[$scope][$key]['description'] ?? $this->schema()[$scope][$key]['label'] ?? '');

            TenantSetting::updateOrCreate(
                [
                    'tenant_id' => $tenant->id,
                    'module'    => $scope,
                    'key'       => $key,
                ],
                [
                    'value'       => TenantSetting::wrapValue($normalized),
                    'description' => $description !== '' ? $description : null,
                ]
            );
        }

        $this->forget($tenant);

        return $this->scope($tenant, $scope);
    }

    public function resetScope(Tenant $tenant, string $scope): array
    {
        $this->assertScope($scope);

        TenantSetting::query()
            ->where('tenant_id', $tenant->id)
            ->where('module', $scope)
            ->delete();

        $this->forget($tenant);

        return $this->scope($tenant, $scope);
    }

    public function forget(Tenant $tenant): void
    {
        Cache::forget($this->cacheKey($tenant->id));
        Cache::forget($this->cacheKey($tenant->id) . ':meta');
        Cache::forget($this->cacheKey($tenant->id) . ':persisted');
    }

    /**
     * Lê todas as linhas do tenant e mescla com defaults do schema.
     *
     * @return array<string, array<string, mixed>>
     */
    private function resolve(Tenant $tenant): array
    {
        $merged = $this->defaults();

        $rows = TenantSetting::query()
            ->where('tenant_id', $tenant->id)
            ->get(['module', 'key', 'value']);

        foreach ($rows as $row) {
            $scope = (string) $row->module;
            $key   = (string) $row->key;

            if (! isset($merged[$scope]) || ! array_key_exists($key, $merged[$scope])) {
                // Chave fora do schema atual — ignora (mantém no banco para histórico).
                continue;
            }

            try {
                $merged[$scope][$key] = $this->castAndValidate($scope, $key, $row->getTypedValue());
            } catch (InvalidArgumentException) {
                // Valor armazenado é inválido (schema mudou). Mantém o default.
            }
        }

        return $merged;
    }

    /**
     * @return array<string, array<string, array<string, mixed>>>
     */
    private function resolveWithMeta(Tenant $tenant): array
    {
        $effective = $this->all($tenant);
        $schema = $this->schema();

        $storedRows = TenantSetting::query()
            ->where('tenant_id', $tenant->id)
            ->get(['module', 'key', 'description'])
            ->keyBy(static fn (TenantSetting $row): string => $row->module . '.' . $row->key);

        $meta = [];

        foreach ($schema as $scope => $keys) {
            $meta[$scope] = [];

            foreach ($keys as $key => $definition) {
                $rowKey = $scope . '.' . $key;
                /** @var TenantSetting|null $stored */
                $stored = $storedRows->get($rowKey);

                $meta[$scope][$key] = [
                    'value' => $effective[$scope][$key] ?? null,
                    'type' => $definition['type'] ?? null,
                    'label' => $definition['label'] ?? null,
                    'description' => $stored?->description
                        ?? ($definition['description'] ?? $definition['label'] ?? null),
                    'default' => $definition['default'] ?? null,
                    'options' => $definition['options'] ?? null,
                    'stored' => $stored !== null,
                ];
            }
        }

        return $meta;
    }

    /**
     * @return array<string, array<string, array<string, mixed>>>
     */
    private function resolvePersisted(Tenant $tenant): array
    {
        $result = [];

        $rows = TenantSetting::query()
            ->where('tenant_id', $tenant->id)
            ->orderBy('module')
            ->orderBy('key')
            ->get(['module', 'key', 'value', 'description', 'updated_at']);

        foreach ($rows as $row) {
            $module = (string) $row->module;
            $key = (string) $row->key;
            $value = $row->getTypedValue();

            if (isset($this->schema()[$module][$key])) {
                try {
                    $value = $this->castAndValidate($module, $key, $value);
                } catch (InvalidArgumentException) {
                    // Mantém o valor bruto no modo persisted se o schema mudou de forma incompatível.
                }
            }

            $result[$module][$key] = [
                'value' => $value,
                'description' => $row->description,
                'updated_at' => $row->updated_at?->toISOString(),
            ];
        }

        return $result;
    }

    private function castAndValidate(string $scope, string $key, mixed $value): mixed
    {
        $meta = $this->schema()[$scope][$key];
        $type = (string) ($meta['type'] ?? 'string');

        switch ($type) {
            case 'bool':
                $bool = filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
                if ($bool === null) {
                    throw new InvalidArgumentException("Valor inválido para {$scope}.{$key}: esperado booleano.");
                }
                return $bool;

            case 'int':
                if (! is_numeric($value)) {
                    throw new InvalidArgumentException("Valor inválido para {$scope}.{$key}: esperado inteiro.");
                }
                $int = (int) $value;
                if (isset($meta['min']) && $int < (int) $meta['min']) {
                    throw new InvalidArgumentException("{$scope}.{$key} deve ser >= {$meta['min']}.");
                }
                if (isset($meta['max']) && $int > (int) $meta['max']) {
                    throw new InvalidArgumentException("{$scope}.{$key} deve ser <= {$meta['max']}.");
                }
                return $int;

            case 'string':
                $str = is_scalar($value) ? (string) $value : '';
                if ($scope === 'payment' && $key === 'default_method' && $str === 'bank_slip') {
                    $str = 'boleto';
                }
                if (isset($meta['options']) && is_array($meta['options']) && ! in_array($str, $meta['options'], true)) {
                    throw new InvalidArgumentException(
                        "{$scope}.{$key} deve estar em: " . implode(', ', $meta['options'])
                    );
                }
                return $str;

            case 'array':
                if (! is_array($value)) {
                    throw new InvalidArgumentException("{$scope}.{$key} deve ser uma lista.");
                }
                $list = array_values(array_unique(array_map(static function ($v) use ($scope, $key): string {
                    $str = (string) $v;
                    if ($scope === 'payment' && $key === 'enabled_methods' && $str === 'bank_slip') {
                        return 'boleto';
                    }

                    return $str;
                }, $value)));
                if (isset($meta['options']) && is_array($meta['options'])) {
                    $invalid = array_diff($list, $meta['options']);
                    if (! empty($invalid)) {
                        throw new InvalidArgumentException(
                            "{$scope}.{$key} contém valores inválidos: " . implode(', ', $invalid)
                        );
                    }
                }
                return $list;
        }

        return $value;
    }

    private function assertScope(string $scope): void
    {
        if (! isset($this->schema()[$scope])) {
            throw new InvalidArgumentException("Escopo de configuração desconhecido: {$scope}.");
        }
    }

    private function assertKey(string $scope, string $key): void
    {
        $this->assertScope($scope);
        if (! isset($this->schema()[$scope][$key])) {
            throw new InvalidArgumentException("Chave de configuração desconhecida: {$scope}.{$key}.");
        }
    }

    private function cacheKey(int $tenantId): string
    {
        return "tenant:{$tenantId}:billing-settings";
    }

    /**
     * @return array<int, string>
     */
    private function providerSupportedMethods(string $providerSlug): array
    {
        return match ($providerSlug) {
            'cora' => ['pix', 'boleto', 'hybrid'],
            // Manual e outros provedores herdam métodos de domínio disponíveis.
            'manual' => $this->domainPaymentMethodSlugs(),
            default => $this->domainPaymentMethodSlugs(),
        };
    }

    /**
     * @return array<int, string>
     */
    private function domainPaymentMethodSlugs(): array
    {
        return Cache::remember('domain:payment-methods:slugs', self::CACHE_TTL_SECONDS, static function (): array {
            return DomainPaymentMethod::query()
                ->orderBy('name')
                ->pluck('slug')
                ->map(static fn ($slug) => (string) $slug)
                ->values()
                ->all();
        });
    }
}

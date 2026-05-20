<?php

namespace App\Services;

use App\Models\Tenant;
use App\Models\TenantSetting;
use InvalidArgumentException;

class TenantMobileThemeService
{
    public const MODULE = 'mobile_theme';

    public const KEY_COLORS = 'colors';

    public const KEY_TEMPLATE_ID = 'template_id';

    /**
     * @return array<string, array<string, mixed>>
     */
    public function templates(): array
    {
        return (array) config('tenant_mobile_theme.templates', []);
    }

    /**
     * @return list<array{id: string, name: string, description: string, preview: list<string>, colors: array<string, string>}>
     */
    public function templatesForApi(): array
    {
        $out = [];
        foreach ($this->templates() as $template) {
            $id = (string) ($template['id'] ?? '');
            if ($id === '') {
                continue;
            }
            $out[] = [
                'id'          => $id,
                'name'        => (string) ($template['name'] ?? $id),
                'description' => (string) ($template['description'] ?? ''),
                'preview'     => array_values((array) ($template['preview'] ?? [])),
                'colors'      => $this->normalizeColorsArray((array) ($template['colors'] ?? []), partial: true),
            ];
        }

        return $out;
    }

    public function defaultTemplateId(): string
    {
        return (string) config('tenant_mobile_theme.default_template_id', 'default');
    }

    /**
     * @return array<string, string>
     */
    public function schema(): array
    {
        return (array) config('tenant_mobile_theme.schema', []);
    }

    /**
     * Chaves permitidas para cores (schema). Não usar templateColors() aqui —
     * normalizeColorsArray() chama colorKeys() e geraria recursão infinita.
     *
     * @return list<string>
     */
    public function colorKeys(): array
    {
        $schema = $this->schema();
        if ($schema !== []) {
            return array_keys($schema);
        }

        $templates = $this->templates();
        $id = $this->defaultTemplateId();
        $template = $templates[$id] ?? null;

        return array_keys((array) ($template['colors'] ?? []));
    }

    /**
     * Defaults = paleta do template original.
     *
     * @return array<string, string>
     */
    public function defaults(): array
    {
        return $this->templateColors($this->defaultTemplateId());
    }

    /**
     * @return array<string, string>
     */
    public function templateColors(string $templateId): array
    {
        $templates = $this->templates();
        $id = $this->normalizeTemplateId($templateId);
        $template = $templates[$id] ?? $templates[$this->defaultTemplateId()] ?? null;

        if (! is_array($template)) {
            return [];
        }

        return $this->normalizeColorsArray((array) ($template['colors'] ?? []), partial: true);
    }

    public function persistedTemplateId(Tenant $tenant): string
    {
        $row = TenantSetting::query()
            ->where('tenant_id', $tenant->id)
            ->where('module', self::MODULE)
            ->where('key', self::KEY_TEMPLATE_ID)
            ->first();

        if (! $row) {
            return $this->defaultTemplateId();
        }

        $value = $row->getTypedValue();

        return $this->normalizeTemplateId(is_string($value) ? $value : $this->defaultTemplateId());
    }

    /**
     * Sobrescritas parciais salvas pelo tenant.
     *
     * @return array<string, string>
     */
    public function persistedColorOverrides(Tenant $tenant): array
    {
        $row = TenantSetting::query()
            ->where('tenant_id', $tenant->id)
            ->where('module', self::MODULE)
            ->where('key', self::KEY_COLORS)
            ->first();

        if (! $row) {
            return [];
        }

        $value = $row->getTypedValue();

        if (! is_array($value)) {
            return [];
        }

        return $this->normalizeColorsArray($value, partial: true);
    }

    /**
     * @deprecated use persistedColorOverrides()
     *
     * @return array<string, string>
     */
    public function persistedColors(Tenant $tenant): array
    {
        return $this->persistedColorOverrides($tenant);
    }

    /**
     * Cores efetivas = template + overrides.
     *
     * @return array<string, string>
     */
    public function effectiveColors(Tenant $tenant): array
    {
        $templateId = $this->persistedTemplateId($tenant);
        $base = $this->templateColors($templateId);
        $overrides = $this->persistedColorOverrides($tenant);

        if ($overrides === []) {
            return $base;
        }

        return array_merge($base, $overrides);
    }

    /**
     * @param  array<string, mixed>  $colorOverrides
     * @return array<string, string>
     */
    public function updateSettings(
        Tenant $tenant,
        ?string $templateId = null,
        array $colorOverrides = [],
        bool $replaceOverrides = false,
    ): array {
        $hasTemplate = $templateId !== null && trim($templateId) !== '';
        $normalizedOverrides = $this->normalizeColorsArray($colorOverrides, partial: true);

        if (! $hasTemplate && $normalizedOverrides === []) {
            throw new InvalidArgumentException('Informe template_id e/ou cores para atualizar.');
        }

        if ($hasTemplate) {
            $id = $this->normalizeTemplateId($templateId);
            TenantSetting::updateOrCreate(
                [
                    'tenant_id' => $tenant->id,
                    'module'    => self::MODULE,
                    'key'       => self::KEY_TEMPLATE_ID,
                ],
                [
                    'value'       => TenantSetting::wrapValue($id),
                    'description' => 'Template de cores do app mobile.',
                ]
            );
        }

        if ($replaceOverrides) {
            TenantSetting::query()
                ->where('tenant_id', $tenant->id)
                ->where('module', self::MODULE)
                ->where('key', self::KEY_COLORS)
                ->delete();
        }

        if ($normalizedOverrides !== []) {
            $current = $this->persistedColorOverrides($tenant);
            $merged = array_merge($current, $normalizedOverrides);

            TenantSetting::updateOrCreate(
                [
                    'tenant_id' => $tenant->id,
                    'module'    => self::MODULE,
                    'key'       => self::KEY_COLORS,
                ],
                [
                    'value'       => TenantSetting::wrapValue($merged),
                    'description' => 'Sobrescritas de cores sobre o template do app mobile.',
                ]
            );
        }

        return $this->effectiveColors($tenant->fresh());
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, string>
     */
    public function updateColors(Tenant $tenant, array $input): array
    {
        return $this->updateSettings($tenant, null, $input);
    }

    public function applyTemplate(Tenant $tenant, string $templateId, bool $clearOverrides = true): array
    {
        return $this->updateSettings(
            $tenant,
            $templateId,
            $clearOverrides ? [] : $this->persistedColorOverrides($tenant),
            replaceOverrides: $clearOverrides,
        );
    }

    /**
     * @return array<string, string>
     */
    public function resetColors(Tenant $tenant): array
    {
        TenantSetting::query()
            ->where('tenant_id', $tenant->id)
            ->where('module', self::MODULE)
            ->whereIn('key', [self::KEY_COLORS, self::KEY_TEMPLATE_ID])
            ->delete();

        return $this->defaults();
    }

    private function normalizeTemplateId(string $templateId): string
    {
        $templateId = strtolower(trim($templateId));
        $templates = $this->templates();

        if (array_key_exists($templateId, $templates)) {
            return $templateId;
        }

        throw new InvalidArgumentException("Template inválido: {$templateId}.");
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, string>
     */
    private function normalizeColorsArray(array $input, bool $partial = false): array
    {
        $allowed = $this->colorKeys();
        $normalized = [];

        foreach ($input as $key => $value) {
            $key = (string) $key;
            if (! in_array($key, $allowed, true)) {
                if ($partial) {
                    continue;
                }
                throw new InvalidArgumentException("Cor inválida: {$key}.");
            }

            $color = $this->normalizeColorValue((string) $value);
            if ($color === null) {
                throw new InvalidArgumentException("Valor inválido para {$key}. Use #RRGGBB ou rgba(...).");
            }

            $normalized[$key] = $color;
        }

        return $normalized;
    }

    private function normalizeColorValue(string $value): ?string
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }

        if (preg_match('/^rgba?\(/i', $value)) {
            return preg_replace('/\s+/', '', $value);
        }

        if (! str_starts_with($value, '#')) {
            $value = '#'.$value;
        }

        if (! preg_match('/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/', $value)) {
            return null;
        }

        if (strlen($value) === 4) {
            $r = $value[1];
            $g = $value[2];
            $b = $value[3];

            return '#'.strtoupper($r.$r.$g.$g.$b.$b);
        }

        return '#'.strtoupper(substr($value, 1));
    }
}

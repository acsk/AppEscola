<?php

namespace App\Services;

use App\Models\DomainPaymentMethod;
use Illuminate\Support\Facades\Cache;

class PaymentProviderRegistry
{
    private const CACHE_TTL_SECONDS = 600;

    /**
     * @return array<string, array<string, mixed>>
     */
    public static function providers(): array
    {
        return (array) config('payment_providers.providers', []);
    }

    /**
     * @return array<int, string>
     */
    public static function billingProviderSlugs(): array
    {
        return array_keys(self::providers());
    }

    /**
     * @return array<int, string>
     */
    public static function gatewayProviderSlugs(): array
    {
        return array_values(array_filter(
            array_keys(self::providers()),
            static fn (string $slug): bool => self::supportsGatewayCharge($slug)
        ));
    }

    public static function exists(string $slug): bool
    {
        return isset(self::providers()[strtolower(trim($slug))]);
    }

    public static function supportsGatewayCharge(string $slug): bool
    {
        return (bool) (self::providers()[strtolower(trim($slug))]['supports_gateway_charge'] ?? false);
    }

    public static function supportsAutoSync(string $slug): bool
    {
        return (bool) (self::providers()[strtolower(trim($slug))]['supports_auto_sync'] ?? false);
    }

    public static function requiresCredentials(string $slug): bool
    {
        return (bool) (self::providers()[strtolower(trim($slug))]['requires_credentials'] ?? false);
    }

    /**
     * @return array<int, string>
     */
    public static function capabilities(string $slug): array
    {
        $slug = strtolower(trim($slug));

        return (array) (self::providers()[$slug]['capabilities'] ?? []);
    }

    /**
     * @return array<int, string>
     */
    public static function supportedMethods(string $providerSlug): array
    {
        $slug = strtolower(trim($providerSlug));
        $config = self::providers()[$slug] ?? null;

        if ($config === null) {
            return self::domainPaymentMethodSlugs();
        }

        $methods = $config['methods'] ?? null;

        if ($methods === null) {
            return self::domainPaymentMethodSlugs();
        }

        return array_values(array_map('strval', $methods));
    }

    /**
     * @return array<int, string>
     */
    public static function defaultEnabledMethods(string $providerSlug): array
    {
        $slug = strtolower(trim($providerSlug));
        $config = self::providers()[$slug] ?? null;

        if ($config === null) {
            return ['pix', 'boleto'];
        }

        $defaults = $config['default_enabled_methods'] ?? $config['methods'] ?? [];

        if ($defaults === null) {
            return self::domainPaymentMethodSlugs();
        }

        return array_values(array_map('strval', $defaults));
    }

    public static function defaultMethod(string $providerSlug): string
    {
        $slug = strtolower(trim($providerSlug));

        return (string) (self::providers()[$slug]['default_method'] ?? 'pix');
    }

    /**
     * @return array<string, array<int, string>>
     */
    public static function methodsByProvider(): array
    {
        $map = [];
        foreach (array_keys(self::providers()) as $slug) {
            $map[$slug] = self::supportedMethods($slug);
        }

        return $map;
    }

    /**
     * Ajusta enabled_methods, default_method e auto_sync ao trocar o provedor.
     *
     * @param  array<string, mixed>  $values
     * @return array<string, mixed>
     */
    public static function normalizePaymentValues(string $providerSlug, array $values, ?array $currentEffective = null): array
    {
        $providerSlug = strtolower(trim($providerSlug));
        $allowedMethods = self::supportedMethods($providerSlug);

        if (! self::supportsAutoSync($providerSlug)) {
            $values['auto_sync_charges'] = false;
        }

        $enabled = $values['enabled_methods'] ?? ($currentEffective['enabled_methods'] ?? null);
        if (! is_array($enabled)) {
            $enabled = self::defaultEnabledMethods($providerSlug);
        }

        $enabled = array_values(array_unique(array_map(static function ($v): string {
            $str = (string) $v;

            return $str === 'bank_slip' ? 'boleto' : $str;
        }, $enabled)));

        $enabled = array_values(array_intersect($enabled, $allowedMethods));
        if ($enabled === []) {
            $enabled = self::defaultEnabledMethods($providerSlug);
            $enabled = array_values(array_intersect($enabled, $allowedMethods));
        }

        $values['enabled_methods'] = $enabled;

        $defaultMethod = strtolower((string) ($values['default_method'] ?? ($currentEffective['default_method'] ?? '')));
        $defaultMethod = $defaultMethod === 'bank_slip' ? 'boleto' : $defaultMethod;

        if ($defaultMethod === '' || ! in_array($defaultMethod, $enabled, true)) {
            $preferred = self::defaultMethod($providerSlug);
            $values['default_method'] = in_array($preferred, $enabled, true)
                ? $preferred
                : ($enabled[0] ?? $preferred);
        } else {
            $values['default_method'] = $defaultMethod;
        }

        return $values;
    }

    /**
     * @return array<int, string>
     */
    private static function domainPaymentMethodSlugs(): array
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

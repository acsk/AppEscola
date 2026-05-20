<?php

namespace App\Services;

use App\Contracts\PaymentGatewayContract;
use RuntimeException;

/**
 * Factory para resolver e instanciar o gateway de pagamento apropriado.
 *
 * Centraliza a lógica de decisão sobre qual implementação usar.
 * Facilita adicionar novos provedores sem modificar código existente.
 */
class PaymentGatewayFactory
{
    /**
     * Mapeamento de slugs/nomes para classes implementadoras.
     * Adicione novos provedores aqui conforme forem implementados.
     */
    /**
     * @return array<string, class-string>
     */
    private static function gatewayMap(): array
    {
        $map = [];
        foreach (PaymentProviderRegistry::providers() as $slug => $config) {
            $class = $config['gateway_class'] ?? null;
            if (is_string($class) && $class !== '') {
                $map[$slug] = $class;
            }
        }

        return $map;
    }

    /**
     * Resolve e retorna uma instância do gateway de pagamento.
     *
     * @param string $providerSlug Slug do provedor ('cora', 'stripe', 'pagseguro', etc)
     *
     * @return PaymentGatewayContract Instância do gateway
     *
     * @throws RuntimeException Se o provedor não estiver registrado ou não for suportado
     */
    public static function resolve(string $providerSlug): PaymentGatewayContract
    {
        $providerSlug = strtolower(trim($providerSlug));

        $gateways = self::gatewayMap();

        if (! isset($gateways[$providerSlug])) {
            $available = implode(', ', array_keys($gateways));

            throw new RuntimeException(
                "Provedor de pagamento '$providerSlug' não possui gateway integrado. "
                . "Provedores com API: $available"
            );
        }

        $className = $gateways[$providerSlug];

        return app($className);
    }

    /**
     * Retorna lista de provedores suportados.
     *
     * @return array<int, string> Lista de slugs dos provedores disponíveis
     */
    public static function supportedProviders(): array
    {
        return array_keys(self::gatewayMap());
    }

    /**
     * Verifica se um provedor é suportado.
     *
     * @param string $providerSlug Slug do provedor
     *
     * @return bool
     */
    public static function isSupported(string $providerSlug): bool
    {
        return isset(self::gatewayMap()[strtolower(trim($providerSlug))]);
    }
}

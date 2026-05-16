<?php

namespace App\Services;

use App\Contracts\PaymentGatewayContract;
use App\Services\Gateways\CoraPaymentGateway;
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
    private const GATEWAYS = [
        'cora' => CoraPaymentGateway::class,
        // 'stripe' => StripePaymentGateway::class,
        // 'pagseguro' => PagSeguroPaymentGateway::class,
    ];

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

        if (! isset(self::GATEWAYS[$providerSlug])) {
            $available = implode(', ', array_keys(self::GATEWAYS));

            throw new RuntimeException(
                "Provedor de pagamento '$providerSlug' não é suportado. "
                . "Provedores disponíveis: $available"
            );
        }

        $className = self::GATEWAYS[$providerSlug];

        return app($className);
    }

    /**
     * Retorna lista de provedores suportados.
     *
     * @return array<int, string> Lista de slugs dos provedores disponíveis
     */
    public static function supportedProviders(): array
    {
        return array_keys(self::GATEWAYS);
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
        return isset(self::GATEWAYS[strtolower(trim($providerSlug))]);
    }
}

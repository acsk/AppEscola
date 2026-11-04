<?php

namespace App\Services;

use App\Contracts\PaymentGatewayContract;
use App\Models\Invoice;
use App\Models\Tenant;

/**
 * Wrapper backward-compatible para o gateway Cora.
 *
 * DEPRECATED: Use PaymentGatewayFactory::resolve('cora') para obter a implementação correta.
 * Esta classe mantém a interface anterior para compatibilidade com código existente.
 *
 * Nova implementação em: CoraPaymentGateway (implementa PaymentGatewayContract)
 */
class CoraPaymentService
{
    private PaymentGatewayContract $gateway;

    public function __construct(private readonly CoraTokenService $tokenService)
    {
        // Delega para a implementação correta
        $this->gateway = app(CoraPaymentGateway::class);
    }

    /**
     * @deprecated Use PaymentGatewayFactory::resolve('cora')->createCharge()
     */
    public function createCharge(Invoice $invoice, string $environment = 'stage', string $method = 'pix'): array
    {
        return $this->gateway->createCharge($invoice, $environment, $method);
    }

    /**
     * @deprecated Use PaymentGatewayFactory::resolve('cora')->listInvoices()
     */
    public function listInvoices(Tenant $tenant, string $environment = 'prod', array $query = []): array
    {
        return $this->gateway->listInvoices($tenant, $environment, $query);
    }

    /**
     * @deprecated Use PaymentGatewayFactory::resolve('cora')->getInvoiceById()
     */
    public function getInvoiceById(Tenant $tenant, string $chargeId, string $environment = 'prod'): array
    {
        return $this->gateway->getInvoiceById($tenant, $chargeId, $environment);
    }

    /**
     * @deprecated Use PaymentGatewayFactory::resolve('cora')->cancelCharge()
     */
    public function cancelCharge(Tenant $tenant, string $chargeId, string $environment = 'prod'): void
    {
        $this->gateway->cancelCharge($tenant, $chargeId, $environment);
    }

    /**
     * Realiza o pagamento de um boleto ou PIX na Cora (apenas em stage para testes).
     *
     * @return array{status: string|null, paid_at: string|null, payload: array}
     *
     * @throws \RuntimeException
     * @throws \Illuminate\Http\Client\ConnectionException
     * @throws \Illuminate\Http\Client\RequestException
     */
    public function payCharge(Invoice $invoice, string $environment = 'stage'): array
    {
        if ($this->gateway instanceof CoraPaymentGateway) {
            return $this->gateway->payCharge($invoice, $environment);
        }

        throw new \RuntimeException('Operação payCharge não suportada pelo gateway.');
    }
}

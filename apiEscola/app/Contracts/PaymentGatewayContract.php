<?php

namespace App\Contracts;

use App\Models\Invoice;
use App\Models\Tenant;

/**
 * Contrato para implementações de gateway de pagamento.
 *
 * Define a interface padrão que todo provedor de pagamento deve seguir.
 * Novas implementações (Stripe, PagSeguro, etc.) devem implementar este contrato.
 */
interface PaymentGatewayContract
{
    /**
     * Cria uma cobrança no gateway de pagamento.
     *
     * @param Invoice $invoice Invoice local com dados do aluno, responsável, valor, data de vencimento
     * @param string $environment 'stage' ou 'prod' — ambiente do gateway
     * @param string $method 'pix', 'boleto', 'credit_card', etc. — método de pagamento
     *
     * @return array{
     *     external_id: string,
     *     status: string|null,
     *     payment_url: string|null,
     *     pix_copy_paste: string|null,
     *     qr_code_image_url: string|null,
     *     boleto_number: string|null,
     *     boleto_digitable: string|null,
     *     payload: array
     * }
     *
     * @throws \RuntimeException
     * @throws \Illuminate\Http\Client\ConnectionException
     * @throws \Illuminate\Http\Client\RequestException
     */
    public function createCharge(Invoice $invoice, string $environment = 'prod', string $method = 'pix'): array;

    /**
     * Lista cobranças/invoices existentes no gateway para um tenant.
     *
     * @param Tenant $tenant Tenant (escola) para qual buscar cobranças
     * @param string $environment 'stage' ou 'prod'
     * @param array<string, mixed> $query Parâmetros de filtro (limit, offset, status, etc)
     *
     * @return array<int, array<string, mixed>> Lista de cobranças externas
     *
     * @throws \RuntimeException
     * @throws \Illuminate\Http\Client\ConnectionException
     * @throws \Illuminate\Http\Client\RequestException
     */
    public function listInvoices(Tenant $tenant, string $environment = 'prod', array $query = []): array;

    /**
     * Consulta os detalhes de uma cobrança específica no gateway.
     *
     * @param Tenant $tenant Tenant (escola)
     * @param string $chargeId ID externo da cobrança no gateway
     * @param string $environment 'stage' ou 'prod'
     *
     * @return array<string, mixed> Dados detalhados da cobrança
     *
     * @throws \RuntimeException
     * @throws \Illuminate\Http\Client\ConnectionException
     * @throws \Illuminate\Http\Client\RequestException
     */
    public function getInvoiceById(Tenant $tenant, string $chargeId, string $environment = 'prod'): array;

    /**
     * Cancela uma cobrança no gateway (ex: boleto pendente, PIX expirado).
     *
     * Deve lançar RuntimeException se o ID da cobrança for inválido.
     * Deve ser silenciosa para 404 (cobrança já não existe no gateway).
     *
     * @param Tenant $tenant Tenant (escola)
     * @param string $chargeId ID externo da cobrança no gateway
     * @param string $environment 'stage' ou 'prod'
     *
     * @return void
     *
     * @throws \RuntimeException
     * @throws \Illuminate\Http\Client\ConnectionException
     * @throws \Illuminate\Http\Client\RequestException
     */
    public function cancelCharge(Tenant $tenant, string $chargeId, string $environment = 'prod'): void;
}

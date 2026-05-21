<?php

namespace App\Services\Gateways;

use App\Contracts\PaymentGatewayContract;
use App\Models\Invoice;
use App\Models\Tenant;
use App\Services\Asaas\AsaasCustomerSyncService;
use App\Services\Asaas\AsaasHttpClient;
use App\Services\Asaas\AsaasPaymentStatusMapper;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class AsaasPaymentGateway implements PaymentGatewayContract
{
    public function __construct(
        private readonly AsaasHttpClient $http,
        private readonly AsaasCustomerSyncService $customerSync,
        private readonly AsaasPaymentStatusMapper $statusMapper,
    ) {
    }

    public function createCharge(Invoice $invoice, string $environment = 'stage', string $method = 'pix'): array
    {
        $invoice->loadMissing(['tenant', 'student.guardians', 'guardian']);

        $normalizedMethod = strtolower(trim($method));
        $billingType = $this->mapBillingType($normalizedMethod);

        if ($billingType === null) {
            throw new RuntimeException('Método de pagamento Asaas não suportado. Use pix, boleto ou credit_card.');
        }

        if ($billingType === 'BOLETO' && ! $invoice->due_date) {
            throw new RuntimeException('Não é possível emitir boleto sem data de vencimento na fatura.');
        }

        Log::info('Asaas createCharge started', [
            'invoice_id' => $invoice->id,
            'tenant_id' => $invoice->tenant_id,
            'environment' => $environment,
            'billing_type' => $billingType,
        ]);

        $customerId = $this->customerSync->resolveOrCreateForInvoice($invoice, $environment);

        $payload = [
            'customer' => $customerId,
            'billingType' => $billingType,
            'value' => round((float) $invoice->amount, 2),
            'dueDate' => $this->resolveDueDate($invoice)->format('Y-m-d'),
            'description' => $this->buildDescription($invoice),
            'externalReference' => (string) $invoice->id,
        ];

        $tenant = $invoice->tenant;

        if (! $tenant instanceof Tenant) {
            throw new RuntimeException('Tenant da fatura não encontrado.');
        }

        $payment = $this->http->post($tenant, 'payments', $environment, $payload);
        $paymentId = trim((string) ($payment['id'] ?? ''));

        if ($paymentId === '') {
            throw new RuntimeException('Resposta do Asaas sem identificador da cobrança.');
        }

        $pixCopyPaste = null;
        $qrCodeImageUrl = null;

        if ($billingType === 'PIX') {
            $pixData = $this->fetchPixQrCode($tenant, $paymentId, $environment);
            $pixCopyPaste = (string) ($pixData['payload'] ?? $pixData['copyPaste'] ?? $pixData['emv'] ?? '');
            $qrCodeImageUrl = (string) ($pixData['encodedImage'] ?? $pixData['qrCodeImage'] ?? '');
            $payment['pix_qr_code'] = $pixData;
        }

        $status = isset($payment['status']) ? (string) $payment['status'] : null;
        $paymentUrl = (string) ($payment['invoiceUrl'] ?? $payment['bankSlipUrl'] ?? '');

        Log::info('Asaas createCharge succeeded', [
            'invoice_id' => $invoice->id,
            'payment_id' => $paymentId,
            'status' => $status,
        ]);

        $payment['integration'] = [
            'provider' => 'asaas',
            'asaas_customer_id' => $customerId,
            'billing_type' => $billingType,
        ];

        return [
            'external_id' => $paymentId,
            'status' => $status,
            'payment_url' => $paymentUrl !== '' ? $paymentUrl : null,
            'pix_copy_paste' => $pixCopyPaste !== '' ? $pixCopyPaste : null,
            'qr_code_image_url' => $qrCodeImageUrl !== '' ? $qrCodeImageUrl : null,
            'boleto_number' => isset($payment['nossoNumero']) ? (string) $payment['nossoNumero'] : null,
            'boleto_digitable' => isset($payment['identificationField']) ? (string) $payment['identificationField'] : null,
            'payload' => $payment,
        ];
    }

    public function listInvoices(Tenant $tenant, string $environment = 'prod', array $query = []): array
    {
        $params = array_merge([
            'limit' => 50,
            'offset' => 0,
        ], $query);

        $body = $this->http->get($tenant, 'payments', $environment, $params);
        $data = $body['data'] ?? [];

        return is_array($data) ? $data : [];
    }

    public function getInvoiceById(Tenant $tenant, string $chargeId, string $environment = 'prod'): array
    {
        $chargeId = trim($chargeId);

        if ($chargeId === '') {
            throw new RuntimeException('ID da cobrança Asaas é obrigatório.');
        }

        $payment = $this->http->get($tenant, 'payments/' . $chargeId, $environment);

        return [
            'id' => (string) ($payment['id'] ?? $chargeId),
            'status' => (string) ($payment['status'] ?? ''),
            'paid_at' => $payment['paymentDate'] ?? $payment['clientPaymentDate'] ?? null,
            'payload' => $payment,
            'local_status' => $this->statusMapper->mapToLocalStatus((string) ($payment['status'] ?? '')),
        ];
    }

    public function cancelCharge(Tenant $tenant, string $chargeId, string $environment = 'prod'): void
    {
        $chargeId = trim($chargeId);

        if ($chargeId === '') {
            throw new RuntimeException('ID da cobrança Asaas é obrigatório para cancelamento.');
        }

        Log::info('Asaas cancelCharge request', [
            'tenant_id' => $tenant->id,
            'charge_id' => $chargeId,
            'environment' => $environment,
        ]);

        try {
            $this->http->delete($tenant, 'payments/' . $chargeId, $environment);
        } catch (RequestException $e) {
            if ($e->response?->status() === 404) {
                Log::info('Asaas cancelCharge: payment not found (already removed)', [
                    'tenant_id' => $tenant->id,
                    'charge_id' => $chargeId,
                ]);

                return;
            }

            throw $e;
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function fetchPixQrCode(Tenant $tenant, string $paymentId, string $environment): array
    {
        try {
            return $this->http->get($tenant, 'payments/' . $paymentId . '/pixQrCode', $environment);
        } catch (RequestException $e) {
            Log::warning('Asaas pixQrCode fetch failed', [
                'payment_id' => $paymentId,
                'status' => $e->response?->status(),
            ]);

            return [];
        }
    }

    private function mapBillingType(string $method): ?string
    {
        return match ($method) {
            'pix' => 'PIX',
            'boleto', 'bank_slip' => 'BOLETO',
            'credit_card', 'card' => 'CREDIT_CARD',
            default => null,
        };
    }

    private function resolveDueDate(Invoice $invoice): Carbon
    {
        if ($invoice->due_date) {
            return Carbon::parse($invoice->due_date);
        }

        return now()->addDays(3);
    }

    private function buildDescription(Invoice $invoice): string
    {
        $description = trim((string) ($invoice->description ?? ''));

        if ($description !== '') {
            return mb_substr($description, 0, 500);
        }

        return sprintf('Fatura #%d', $invoice->id);
    }
}

<?php

namespace App\Services;

use App\Models\Invoice;
use App\Models\Tenant;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;

class CoraPaymentService
{
    public function __construct(private readonly CoraTokenService $tokenService)
    {
    }

    /**
     * Cria uma cobrança na Cora para a fatura local.
     *
     * @return array{external_id: string, status: string|null, payment_url: string|null, pix_copy_paste: string|null, payload: array}
     *
     * @throws RuntimeException
     * @throws ConnectionException
     * @throws RequestException
     */
    public function createCharge(Invoice $invoice, string $environment = 'stage', string $method = 'pix'): array
    {
        $invoice->loadMissing(['tenant', 'student', 'guardian']);

        $token = $this->resolveBearerToken($invoice->tenant, $environment);
        $normalizedMethod = strtolower(trim($method));

        if (! in_array($normalizedMethod, ['pix', 'boleto'], true)) {
            throw new RuntimeException('Método de pagamento Cora não suportado. Use pix ou boleto.');
        }

        $baseUrl = $this->resolveApiBaseUrl($environment);

        if ($token === '' || $baseUrl === '') {
            throw new RuntimeException('Integração Cora não configurada. Configure credenciais do tenant (certificado/chave/client_id) ou CORA_API_TOKEN.');
        }

        $payerName = $invoice->guardian?->name ?? $invoice->student?->name ?? 'Responsável';
        $payerDocument = $this->digitsOnly($invoice->guardian?->document ?? $invoice->student?->document ?? '');
        $payerEmail = $invoice->guardian?->email ?? $invoice->student?->email;

        if ($normalizedMethod === 'boleto' && ! $invoice->due_date) {
            throw new RuntimeException('Não é possível emitir boleto sem data de vencimento na fatura.');
        }

        if ($normalizedMethod === 'boleto') {
            $endpoint = '/v2/invoices';
            $payload = $this->buildBoletoPayload($invoice, $payerName, $payerDocument, $payerEmail, $environment);
        } else {
            $endpoint = '/' . ltrim((string) config('services.cora.charges_endpoint', '/v1/charges'), '/');
            $payload = [
                'external_reference' => 'invoice-' . $invoice->id,
                'amount' => (int) round(((float) $invoice->amount) * 100),
                'currency' => 'BRL',
                'description' => $invoice->description,
                'due_date' => $invoice->due_date?->toDateString(),
                'payment_method' => 'pix',
                'payer' => array_filter([
                    'name' => $payerName,
                    'document' => $payerDocument !== '' ? $payerDocument : null,
                    'email' => $payerEmail,
                ], static fn ($value) => $value !== null && $value !== ''),
                'metadata' => [
                    'tenant_id' => $invoice->tenant_id,
                    'invoice_id' => $invoice->id,
                    'student_id' => $invoice->student_id,
                    'environment' => $environment,
                ],
            ];
        }

        $response = Http::timeout((int) config('services.cora.timeout', 20))
            ->acceptJson()
            ->asJson()
            ->withToken($token)
            ->withHeaders([
                'Idempotency-Key' => (string) Str::uuid(),
            ])
            ->post($baseUrl . $endpoint, $payload)
            ->throw();

        $body = $response->json();

        if (! is_array($body)) {
            throw new RuntimeException('Resposta inválida da Cora.');
        }

        $externalId = (string) ($body['id'] ?? $body['invoice_id'] ?? $body['charge_id'] ?? '');

        if ($externalId === '') {
            throw new RuntimeException('Resposta da Cora sem identificador da cobrança.');
        }

        return [
            'external_id' => $externalId,
            'status' => isset($body['status']) ? (string) $body['status'] : null,
            'payment_url' => $this->extractPaymentUrl($body),
            'pix_copy_paste' => $normalizedMethod === 'pix' ? $this->extractPixCode($body) : null,
            'payload' => $body,
        ];
    }

    private function buildBoletoPayload(
        Invoice $invoice,
        string $payerName,
        string $payerDocument,
        ?string $payerEmail,
        string $environment
    ): array {
        $identity = $payerDocument !== '' ? $payerDocument : '45114521802';
        $docType = strlen($identity) > 11 ? 'CNPJ' : 'CPF';
        $description = trim((string) $invoice->description) !== '' ? (string) $invoice->description : 'Cobrança escolar';

        return [
            'code' => 'invoice-' . $invoice->id . '-' . now()->format('YmdHis'),
            'customer' => [
                'name' => $payerName,
                'email' => $payerEmail,
                'document' => [
                    'identity' => $identity,
                    'type' => $docType,
                ],
            ],
            'services' => [
                [
                    'name' => 'Mensalidade',
                    'description' => $description,
                    'amount' => (int) round(((float) $invoice->amount) * 100),
                ],
            ],
            'payment_terms' => [
                'due_date' => $invoice->due_date?->toDateString(),
            ],
            'metadata' => [
                'tenant_id' => $invoice->tenant_id,
                'invoice_id' => $invoice->id,
                'student_id' => $invoice->student_id,
                'environment' => $environment,
            ],
        ];
    }

    private function extractPaymentUrl(array $body): ?string
    {
        $candidates = [
            $body['payment_url'] ?? null,
            $body['checkout_url'] ?? null,
            $body['payment_options']['bank_slip']['url'] ?? null,
            $body['payment_options']['bank_slip']['pdf'] ?? null,
            $body['links']['payment'] ?? null,
            $body['links']['checkout'] ?? null,
            $body['link'] ?? null,
        ];

        foreach ($candidates as $value) {
            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
        }

        return null;
    }

    private function extractPixCode(array $body): ?string
    {
        $candidates = [
            $body['pix']['copy_paste'] ?? null,
            $body['pix']['emv'] ?? null,
            $body['pix_copy_paste'] ?? null,
            $body['emv'] ?? null,
        ];

        foreach ($candidates as $value) {
            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
        }

        return null;
    }

    private function digitsOnly(string $value): string
    {
        return preg_replace('/\D+/', '', $value) ?? '';
    }

    private function resolveBearerToken(?Tenant $tenant, string $environment = 'stage'): string
    {
        if ($tenant && $this->tokenService->hasTenantCredentials($tenant, $environment)) {
            return $this->tokenService->generateForTenant($tenant, $environment)['access_token'];
        }

        return (string) config('services.cora.token', '');
    }

    private function resolveApiBaseUrl(string $environment): string
    {
        $env = strtolower(trim($environment));

        if (in_array($env, ['prod', 'production'], true)) {
            return rtrim((string) config('services.cora.api_base_url_prod', 'https://matls-clients.api.cora.com.br'), '/');
        }

        return rtrim((string) config('services.cora.api_base_url_stage', 'https://matls-clients.api.stage.cora.com.br'), '/');
    }
}

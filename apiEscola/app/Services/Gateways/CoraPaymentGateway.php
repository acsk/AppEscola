<?php

namespace App\Services\Gateways;

use App\Contracts\PaymentGatewayContract;
use App\Models\Invoice;
use App\Models\TenantCoraCredential;
use App\Models\Tenant;
use App\Services\CoraTokenService;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

class CoraPaymentGateway implements PaymentGatewayContract
{
    public function __construct(private readonly CoraTokenService $tokenService)
    {
    }

    /**
     * Cria uma cobrança na Cora para a fatura local.
     *
     * @return array{external_id: string, status: string|null, payment_url: string|null, pix_copy_paste: string|null, qr_code_image_url: string|null, payload: array}
     *
     * @throws RuntimeException
     * @throws ConnectionException
     * @throws RequestException
     */
    public function createCharge(Invoice $invoice, string $environment = 'stage', string $method = 'pix'): array
    {
        $invoice->loadMissing(['tenant', 'student.guardians', 'guardian']);

        Log::info('Cora createCharge started', [
            'invoice_id' => $invoice->id,
            'tenant_id' => $invoice->tenant_id,
            'environment' => $environment,
            'requested_method' => $method,
        ]);

        $token = $this->resolveBearerToken($invoice->tenant, $environment);
        $normalizedMethod = strtolower(trim($method));

        if (! in_array($normalizedMethod, ['pix', 'boleto', 'hybrid'], true)) {
            throw new RuntimeException('Método de pagamento Cora não suportado. Use pix ou boleto.');
        }

        $baseUrl = $this->resolveApiBaseUrl($environment);

        if ($token === '' || $baseUrl === '') {
            throw new RuntimeException('Integração Cora não configurada. Configure credenciais do tenant (certificado/chave/client_id) ou CORA_API_TOKEN.');
        }

        $payerGuardian = $this->resolvePayerGuardian($invoice);
        $payerName = $payerGuardian?->name ?? $invoice->student?->name ?? 'Responsável';
        $payerDocument = $this->digitsOnly($payerGuardian?->document ?? $invoice->student?->document ?? '');
        $payerEmail = $payerGuardian?->email ?? $invoice->student?->email;

        if (in_array($normalizedMethod, ['boleto', 'hybrid'], true) && ! $invoice->due_date) {
            throw new RuntimeException('Não é possível emitir boleto/hybrid sem data de vencimento na fatura.');
        }

        $endpoint = '/v2/invoices';
        if ($normalizedMethod === 'boleto') {
            $payload = $this->buildBoletoPayload($invoice, $payerName, $payerDocument, $payerEmail, $environment, 'boleto');
        } elseif ($normalizedMethod === 'pix') {
            $payload = $this->buildBoletoPayload($invoice, $payerName, $payerDocument, $payerEmail, $environment, 'pix');
        } else {
            // hybrid: envia ambos os formatos
            $payload = $this->buildBoletoPayload($invoice, $payerName, $payerDocument, $payerEmail, $environment, 'hybrid');
        }

        Log::info('Cora createCharge request prepared', [
            'invoice_id' => $invoice->id,
            'tenant_id' => $invoice->tenant_id,
            'environment' => $environment,
            'normalized_method' => $normalizedMethod,
            'endpoint' => $baseUrl . $endpoint,
        ]);

        $httpOptions = $this->resolveHttpClientOptions($invoice->tenant, $environment);

        Log::info('Cora createCharge HTTP options', [
            'invoice_id' => $invoice->id,
            'tenant_id' => $invoice->tenant_id,
            'environment' => $environment,
            'mtls_enabled' => isset($httpOptions['cert'], $httpOptions['ssl_key']),
            'verify_ssl' => $httpOptions['verify'] ?? null,
        ]);

        try {
            $response = Http::timeout((int) config('services.cora.timeout', 20))
                ->acceptJson()
                ->asJson()
                ->withOptions($httpOptions)
                ->withToken($token)
                ->withHeaders([
                    'Idempotency-Key' => (string) Str::uuid(),
                ])
                ->post($baseUrl . $endpoint, $payload)
                ->throw();
        } catch (RequestException $e) {
            Log::warning('Cora createCharge request failed', [
                'invoice_id' => $invoice->id,
                'tenant_id' => $invoice->tenant_id,
                'environment' => $environment,
                'normalized_method' => $normalizedMethod,
                'status' => $e->response?->status(),
                'provider_error' => $e->response?->json('error'),
                'provider_message' => $e->response?->json('message'),
            ]);

            throw $e;
        }

        $body = $response->json();

        if (! is_array($body)) {
            throw new RuntimeException('Resposta inválida da Cora.');
        }

        $externalId = (string) ($body['id'] ?? $body['invoice_id'] ?? $body['charge_id'] ?? '');

        if ($externalId === '') {
            throw new RuntimeException('Resposta da Cora sem identificador da cobrança.');
        }

        Log::info('Cora createCharge succeeded', [
            'invoice_id' => $invoice->id,
            'tenant_id' => $invoice->tenant_id,
            'environment' => $environment,
            'normalized_method' => $normalizedMethod,
            'external_id' => $externalId,
            'status' => $body['status'] ?? null,
        ]);

        return [
            'external_id' => $externalId,
            'status' => isset($body['status']) ? (string) $body['status'] : null,
            'payment_url' => $this->extractPaymentUrl($body),
            'pix_copy_paste' => $this->extractPixCode($body),
            'qr_code_image_url' => $this->extractPixImageUrl($body),
            'boleto_number' => $this->extractBoletoNumber($body),
            'boleto_digitable' => $this->extractBoletoDigitable($body),
            'payload' => $body,
        ];
    }

    /**
     * Lista cobrancas/invoices existentes na Cora para um tenant.
     *
     * @return array<int, array<string, mixed>>
     *
     * @throws RuntimeException
     * @throws ConnectionException
     * @throws RequestException
     */
    public function listInvoices(Tenant $tenant, string $environment = 'prod', array $query = []): array
    {
        $token = $this->resolveBearerToken($tenant, $environment);
        $baseUrl = $this->resolveApiBaseUrl($environment);

        if ($token === '' || $baseUrl === '') {
            throw new RuntimeException('Integracao Cora nao configurada para listar cobrancas.');
        }

        $httpOptions = $this->resolveHttpClientOptions($tenant, $environment);

        $baseQuery = $query;
        $maxPages = max(1, (int) ($baseQuery['max_pages'] ?? 8));
        unset($baseQuery['max_pages']);

        if (! isset($baseQuery['limit'])) {
            $baseQuery['limit'] = 200;
        }

        $allInvoices = [];
        $seenKeys = [];
        $nextCursor = null;

        for ($page = 1; $page <= $maxPages; $page++) {
            $pageQuery = $baseQuery;

            if ($nextCursor !== null && $nextCursor !== '') {
                $pageQuery['cursor'] = $nextCursor;
            }

            $response = Http::timeout((int) config('services.cora.timeout', 20))
                ->acceptJson()
                ->withOptions($httpOptions)
                ->withToken($token)
                ->get($baseUrl . '/v2/invoices', $pageQuery)
                ->throw();

            $body = $response->json();

            if (! is_array($body)) {
                throw new RuntimeException('Resposta invalida da Cora ao listar cobrancas.');
            }

            $invoices = $this->extractInvoicesCollection($body);

            foreach ($invoices as $invoice) {
                $key = trim((string) (
                    $invoice['id']
                    ?? $invoice['invoice_id']
                    ?? $invoice['charge_id']
                    ?? md5(json_encode($invoice))
                ));

                if ($key === '' || isset($seenKeys[$key])) {
                    continue;
                }

                $seenKeys[$key] = true;
                $allInvoices[] = $invoice;
            }

            $nextCursor = $this->extractNextCursor($body);
            $hasMore = $this->extractHasMore($body);

            $this->writeSyncDebug('listInvoices-page', [
                'tenant_id' => $tenant->id,
                'environment' => $environment,
                'page' => $page,
                'query' => $pageQuery,
                'http_status' => $response->status(),
                'body_keys' => array_keys($body),
                'page_items' => count($invoices),
                'accumulated_items' => count($allInvoices),
                'next_cursor' => $nextCursor,
                'has_more' => $hasMore,
            ]);

            if ($nextCursor === '' || $nextCursor === null) {
                if (! $hasMore) {
                    break;
                }

                if (isset($pageQuery['page']) && is_numeric($pageQuery['page'])) {
                    $baseQuery['page'] = ((int) $pageQuery['page']) + 1;
                    continue;
                }

                break;
            }
        }

        $this->writeSyncDebug('listInvoices', [
            'tenant_id' => $tenant->id,
            'environment' => $environment,
            'query' => $query,
            'parsed_count' => count($allInvoices),
            'first_invoice_preview' => isset($allInvoices[0]) ? array_slice($allInvoices[0], 0, 12, true) : null,
        ]);

        Log::info('Cora listInvoices response parsed', [
            'tenant_id' => $tenant->id,
            'environment' => $environment,
            'query' => $query,
            'parsed_count' => count($allInvoices),
        ]);

        if ($allInvoices === []) {
            Log::warning('Cora listInvoices parsed vazio', [
                'tenant_id' => $tenant->id,
                'environment' => $environment,
                'query' => $query,
            ]);
        }

        return $allInvoices;
    }

    /**
     * Busca uma cobranca especifica na Cora por ID.
     *
     * @return array<string, mixed>
     *
     * @throws RuntimeException
     * @throws ConnectionException
     * @throws RequestException
     */
    public function getInvoiceById(Tenant $tenant, string $chargeId, string $environment = 'prod'): array
    {
        $chargeId = trim($chargeId);

        if ($chargeId === '') {
            throw new RuntimeException('ID da cobranca Cora obrigatorio para consulta detalhada.');
        }

        $token = $this->resolveBearerToken($tenant, $environment);
        $baseUrl = $this->resolveApiBaseUrl($environment);

        if ($token === '' || $baseUrl === '') {
            throw new RuntimeException('Integracao Cora nao configurada para consultar cobranca.');
        }

        $httpOptions = $this->resolveHttpClientOptions($tenant, $environment);

        $response = Http::timeout((int) config('services.cora.timeout', 20))
            ->acceptJson()
            ->withOptions($httpOptions)
            ->withToken($token)
            ->get($baseUrl . '/v2/invoices/' . $chargeId)
            ->throw();

        $body = $response->json();

        if (! is_array($body)) {
            throw new RuntimeException('Resposta invalida da Cora ao consultar cobranca por ID.');
        }

        if ($this->looksLikeInvoiceItem($body)) {
            return $body;
        }

        if (isset($body['data']) && is_array($body['data']) && $this->looksLikeInvoiceItem($body['data'])) {
            return $body['data'];
        }

        if (isset($body['body']) && is_array($body['body']) && $this->looksLikeInvoiceItem($body['body'])) {
            return $body['body'];
        }

        return $body;
    }

    /**
     * Cancela uma cobrança na Cora via DELETE /v2/invoices/{id}.
     *
     * Lança RuntimeException se a cobrança não existir no Cora (404 é silenciado — considera cancelada).
     * Lança RequestException para outros erros HTTP.
     *
     * @throws RuntimeException
     * @throws ConnectionException
     * @throws RequestException
     */
    public function cancelCharge(Tenant $tenant, string $chargeId, string $environment = 'prod'): void
    {
        $chargeId = trim($chargeId);

        if ($chargeId === '') {
            throw new RuntimeException('ID da cobrança Cora obrigatório para cancelamento.');
        }

        $token = $this->resolveBearerToken($tenant, $environment);
        $baseUrl = $this->resolveApiBaseUrl($environment);

        if ($token === '' || $baseUrl === '') {
            throw new RuntimeException('Integração Cora não configurada para cancelar cobrança.');
        }

        $httpOptions = $this->resolveHttpClientOptions($tenant, $environment);

        Log::info('Cora cancelCharge request', [
            'tenant_id' => $tenant->id,
            'charge_id' => $chargeId,
            'environment' => $environment,
        ]);

        try {
            Http::timeout((int) config('services.cora.timeout', 20))
                ->acceptJson()
                ->withOptions($httpOptions)
                ->withToken($token)
                ->delete($baseUrl . '/v2/invoices/' . $chargeId)
                ->throw();

            Log::info('Cora cancelCharge succeeded', [
                'tenant_id' => $tenant->id,
                'charge_id' => $chargeId,
                'environment' => $environment,
            ]);
        } catch (RequestException $e) {
            // 404 = cobrança já não existe na Cora (expirou ou já foi cancelada lá)
            if ($e->response?->status() === 404) {
                Log::info('Cora cancelCharge: charge not found on Cora (already cancelled/expired)', [
                    'tenant_id' => $tenant->id,
                    'charge_id' => $chargeId,
                    'environment' => $environment,
                ]);

                return;
            }

            Log::warning('Cora cancelCharge failed', [
                'tenant_id' => $tenant->id,
                'charge_id' => $chargeId,
                'environment' => $environment,
                'http_status' => $e->response?->status(),
                'provider_error' => $e->response?->json(),
            ]);

            throw $e;
        }
    }

    /**
     * Realiza o pagamento de um boleto ou PIX na Cora (apenas em stage para testes).
     *
     * @return array{status: string|null, paid_at: string|null, payload: array}
     *
     * @throws RuntimeException
     * @throws ConnectionException
     * @throws RequestException
     */
    public function payCharge(Invoice $invoice, string $environment = 'stage'): array
    {
        $invoice->loadMissing(['tenant']);

        Log::info('Cora payCharge started', [
            'invoice_id' => $invoice->id,
            'tenant_id' => $invoice->tenant_id,
            'environment' => $environment,
            'cora_charge_id' => $invoice->cora_charge_id,
        ]);

        if (! $invoice->cora_charge_id) {
            throw new RuntimeException('Fatura sem ID de cobrança Cora. Gere a cobrança primeiro.');
        }

        $token = $this->resolveBearerToken($invoice->tenant, $environment);
        $baseUrl = $this->resolveApiBaseUrl($environment);

        if ($token === '' || $baseUrl === '') {
            throw new RuntimeException('Integração Cora não configurada. Configure credenciais do tenant ou CORA_API_TOKEN.');
        }

        $endpoint = '/v2/invoices/pay';
        $payload = [
            'id' => $invoice->cora_charge_id,
        ];

        $httpOptions = $this->resolveHttpClientOptions($invoice->tenant, $environment);

        Log::info('Cora payCharge HTTP options', [
            'invoice_id' => $invoice->id,
            'tenant_id' => $invoice->tenant_id,
            'environment' => $environment,
            'mtls_enabled' => isset($httpOptions['cert'], $httpOptions['ssl_key']),
            'verify_ssl' => $httpOptions['verify'] ?? null,
        ]);

        try {
            $response = Http::timeout((int) config('services.cora.timeout', 20))
                ->acceptJson()
                ->asJson()
                ->withOptions($httpOptions)
                ->withToken($token)
                ->withHeaders([
                    'Idempotency-Key' => (string) Str::uuid(),
                ])
                ->post($baseUrl . $endpoint, $payload)
                ->throw();
        } catch (RequestException $e) {
            Log::warning('Cora payCharge request failed', [
                'invoice_id' => $invoice->id,
                'tenant_id' => $invoice->tenant_id,
                'environment' => $environment,
                'cora_charge_id' => $invoice->cora_charge_id,
                'status' => $e->response?->status(),
                'provider_error' => $e->response?->json('error'),
                'provider_message' => $e->response?->json('message'),
            ]);

            throw $e;
        }

        $body = $response->json();

        if (! is_array($body)) {
            throw new RuntimeException('Resposta inválida da Cora ao pagar cobrança.');
        }

        $status = isset($body['status']) ? (string) $body['status'] : null;
        $paidAt = null;

        // Se o status indica que foi pago, usar a data/hora atual
        if (in_array($status, ['paid', 'IN_PAYMENT', 'in_payment', 'completed'], true)) {
            $paidAt = now()->toISOString();
        }

        Log::info('Cora payCharge finished', [
            'invoice_id' => $invoice->id,
            'tenant_id' => $invoice->tenant_id,
            'environment' => $environment,
            'cora_charge_id' => $invoice->cora_charge_id,
            'status' => $status,
            'paid_at' => $paidAt,
        ]);

        return [
            'status' => $status,
            'paid_at' => $paidAt,
            'payload' => $body,
        ];
    }

    /**
     * @param array<string, mixed> $body
     */
    private function extractNextCursor(array $body): ?string
    {
        $candidates = [
            $body['next_cursor'] ?? null,
            $body['next'] ?? null,
            $body['cursor'] ?? null,
            data_get($body, 'meta.next_cursor'),
            data_get($body, 'pagination.next_cursor'),
            data_get($body, 'page.next_cursor'),
            data_get($body, 'links.next'),
        ];

        foreach ($candidates as $candidate) {
            if (is_string($candidate) && trim($candidate) !== '') {
                $value = trim($candidate);

                if (str_starts_with($value, 'http://') || str_starts_with($value, 'https://')) {
                    $parts = parse_url($value);
                    parse_str((string) ($parts['query'] ?? ''), $params);
                    $cursorFromUrl = trim((string) ($params['cursor'] ?? $params['next_cursor'] ?? ''));
                    if ($cursorFromUrl !== '') {
                        return $cursorFromUrl;
                    }
                }

                return $value;
            }
        }

        return null;
    }

    /**
     * @param array<string, mixed> $body
     */
    private function extractHasMore(array $body): bool
    {
        $candidates = [
            $body['has_more'] ?? null,
            data_get($body, 'meta.has_more'),
            data_get($body, 'pagination.has_more'),
            data_get($body, 'page.has_more'),
        ];

        foreach ($candidates as $candidate) {
            if (is_bool($candidate)) {
                return $candidate;
            }

            if (is_numeric($candidate)) {
                return ((int) $candidate) === 1;
            }
        }

        return false;
    }

    private function buildBoletoPayload(
        Invoice $invoice,
        string $payerName,
        string $payerDocument,
        ?string $payerEmail,
        string $environment,
        string $method = 'boleto'
    ): array {
        $identity = $payerDocument !== '' ? $payerDocument : '';
        $docType = strlen($identity) > 11 ? 'CNPJ' : 'CPF';
        $description = trim((string) $invoice->description) !== '' ? (string) $invoice->description : 'Cobrança escolar';
        $providerDueDate = $this->resolveProviderDueDate($invoice);

        // Define payment_forms baseado no método solicitado
        $paymentForms = match ($method) {
            'boleto' => ['BANK_SLIP'],
            'pix' => ['PIX'],
            'hybrid' => ['BANK_SLIP', 'PIX'],
            default => ['BANK_SLIP', 'PIX'],
        };

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
                'due_date' => $providerDueDate,
            ],
            'payment_forms' => $paymentForms,
            'metadata' => [
                'tenant_id' => $invoice->tenant_id,
                'invoice_id' => $invoice->id,
                'student_id' => $invoice->student_id,
                'environment' => $environment,
            ],
        ];
    }

    private function resolvePayerGuardian(Invoice $invoice): ?\App\Models\Guardian
    {
        if ($invoice->guardian) {
            return $invoice->guardian;
        }

        $financialGuardian = $invoice->student?->guardians
            ?->first(fn ($guardian) => (bool) data_get($guardian, 'pivot.is_financial_responsible', false));

        if ($financialGuardian) {
            return $financialGuardian;
        }

        if ($invoice->student?->is_minor) {
            throw new RuntimeException('Aluno menor de idade sem responsável financeiro cadastrado. Não é possível gerar a cobrança.');
        }

        return null;
    }

    private function buildPixPayload(
        Invoice $invoice,
        string $payerName,
        string $payerDocument,
        ?string $payerEmail,
        string $environment
    ): array {
        return $this->buildBoletoPayload($invoice, $payerName, $payerDocument, $payerEmail, $environment, 'pix');
    }

    private function resolveProviderDueDate(Invoice $invoice): string
    {
        $baseDate = $invoice->due_date instanceof Carbon
            ? $invoice->due_date->copy()->startOfDay()
            : Carbon::today();

        $minimumDate = Carbon::today()->addDay()->startOfDay();

        if ($baseDate->lt($minimumDate)) {
            return $minimumDate->toDateString();
        }

        return $baseDate->toDateString();
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

    private function extractPixImageUrl(array $body): ?string
    {
        $candidates = [
            $body['pix']['qr_code_image_url'] ?? null,
            $body['pix']['qr_code_url'] ?? null,
            $body['payment_options']['pix']['url'] ?? null,
            $body['payment_options']['pix']['qr_code_url'] ?? null,
            $body['qr_code_image_url'] ?? null,
            $body['qr_code_url'] ?? null,
        ];

        foreach ($candidates as $value) {
            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
        }

        return null;
    }

    private function extractBoletoNumber(array $body): ?string
    {
        $candidates = [
            $body['payment_options']['bank_slip']['barcode'] ?? null,
            $body['payment_options']['bank_slip']['number'] ?? null,
            $body['bank_slip']['barcode'] ?? null,
            $body['boleto']['barcode'] ?? null,
            $body['barcode'] ?? null,
        ];

        foreach ($candidates as $value) {
            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
        }

        return null;
    }

    private function extractBoletoDigitable(array $body): ?string
    {
        $candidates = [
            $body['payment_options']['bank_slip']['digitable'] ?? null,
            $body['payment_options']['bank_slip']['our_number'] ?? null,
            $body['bank_slip']['digitable'] ?? null,
            $body['boleto']['digitable'] ?? null,
            $body['digitable'] ?? null,
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
            return rtrim((string) config('services.cora.api_base_url_prod', 'https://api.cora.com.br'), '/');
        }

        return rtrim((string) config('services.cora.api_base_url_stage', 'https://api.stage.cora.com.br'), '/');
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function extractInvoicesCollection(array $body): array
    {
        if ($this->looksLikeInvoiceItem($body)) {
            return [$body];
        }

        if (isset($body['data']) && is_array($body['data']) && $this->looksLikeInvoiceItem($body['data'])) {
            return [$body['data']];
        }

        if (isset($body['body']) && is_array($body['body']) && $this->looksLikeInvoiceItem($body['body'])) {
            return [$body['body']];
        }

        $sources = [
            $body['items'] ?? null,
            $body['data'] ?? null,
            $body['data']['items'] ?? null,
            $body['data']['invoices'] ?? null,
            $body['results'] ?? null,
            $body['invoices'] ?? null,
            $body['body'] ?? null,
            $body['body']['items'] ?? null,
            $body['body']['invoices'] ?? null,
            $body['page']['items'] ?? null,
            $body['page']['data'] ?? null,
        ];

        foreach ($sources as $source) {
            if (! is_array($source)) {
                continue;
            }

            $list = [];

            foreach ($source as $item) {
                if (is_array($item)) {
                    $list[] = $item;
                }
            }

            if ($list !== []) {
                return $list;
            }
        }

        $isList = array_is_list($body);
        if ($isList) {
            $list = [];
            foreach ($body as $item) {
                if (is_array($item)) {
                    $list[] = $item;
                }
            }

            return $list;
        }

        // Fallback: percorre a resposta procurando listas de objetos com "cara" de invoice.
        $discovered = $this->findInvoiceLikeList($body);
        if ($discovered !== []) {
            return $discovered;
        }

        return [];
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<int, array<string, mixed>>
     */
    private function findInvoiceLikeList(array $payload): array
    {
        foreach ($payload as $value) {
            if (! is_array($value)) {
                continue;
            }

            // Caso seja uma lista de objetos.
            if (array_is_list($value)) {
                $list = [];
                foreach ($value as $item) {
                    if (! is_array($item)) {
                        continue;
                    }

                    if ($this->looksLikeInvoiceItem($item)) {
                        $list[] = $item;
                    }
                }

                if ($list !== []) {
                    return $list;
                }
            }

            // Caso seja um objeto aninhado, continua procurando recursivamente.
            $nested = $this->findInvoiceLikeList($value);
            if ($nested !== []) {
                return $nested;
            }
        }

        return [];
    }

    /**
     * @param array<string, mixed> $item
     */
    private function looksLikeInvoiceItem(array $item): bool
    {
        return isset($item['id'])
            || isset($item['invoice_id'])
            || isset($item['charge_id'])
            || isset($item['customer'])
            || isset($item['services'])
            || isset($item['payment_terms'])
            || isset($item['payment_forms']);
    }

    private function resolveHttpClientOptions(?Tenant $tenant, string $environment): array
    {
        $options = [
            'verify' => (bool) config('services.cora.verify_ssl', true),
        ];

        if (! $tenant) {
            return $options;
        }

        $normalizedEnvironment = in_array(strtolower(trim($environment)), ['prod', 'production'], true)
            ? 'prod'
            : 'stage';

        $credential = $tenant->coraCredentials()
            ->where('active', true)
            ->where('environment', $normalizedEnvironment)
            ->orderByDesc('configured_at')
            ->orderByDesc('id')
            ->first();

        if (! $credential instanceof TenantCoraCredential) {
            return $options;
        }

        $certPath = (string) $credential->certificate_path;
        $keyPath = (string) $credential->private_key_path;

        if ($certPath === '' || $keyPath === '') {
            return $options;
        }

        if (! Storage::disk('local')->exists($certPath) || ! Storage::disk('local')->exists($keyPath)) {
            return $options;
        }

        $options['cert'] = Storage::disk('local')->path($certPath);
        $options['ssl_key'] = Storage::disk('local')->path($keyPath);

        return $options;
    }

    /**
     * @param array<string, mixed> $context
     */
    private function writeSyncDebug(string $stage, array $context): void
    {
        try {
            Log::debug('[CORA_SYNC_DEBUG] ' . $stage, $context);

            Log::build([
                'driver' => 'single',
                'path' => storage_path('logs/cora_sync_debug.log'),
                'level' => 'debug',
            ])->debug('[CORA_SYNC_DEBUG] ' . $stage, $context);
        } catch (\Throwable $e) {
            Log::warning('Falha ao escrever cora_sync_debug.log', [
                'stage' => $stage,
                'error' => $e->getMessage(),
            ]);
        }
    }
}

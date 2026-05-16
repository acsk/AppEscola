<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\PaymentProvider;
use App\Models\Tenant;
use App\Models\TenantCoraCredential;
use App\Services\PaymentGatewayFactory;
use App\Services\CoraTokenService;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class PaymentProviderController extends Controller
{
    private function ensureCanManageTenant(Request $request, Tenant $tenant): void
    {
        $user = $request->user();

        if (! $user || ! in_array($user->role, ['super_admin', 'admin'], true)) {
            throw new AccessDeniedHttpException('Acesso permitido apenas para admin ou super admin.');
        }

        if ($user->isSuperAdmin()) {
            return;
        }

        if ((int) $user->tenant_id !== (int) $tenant->id) {
            throw new AccessDeniedHttpException('Admin só pode acessar configurações do próprio tenant.');
        }
    }

    private function ensureCanAccessInvoice(Request $request, Invoice $invoice): void
    {
        $user = $request->user();

        if (! $user || ! in_array($user->role, ['super_admin', 'admin'], true)) {
            throw new AccessDeniedHttpException('Acesso permitido apenas para admin ou super admin.');
        }

        if ($user->isSuperAdmin()) {
            return;
        }

        if ((int) $user->tenant_id !== (int) $invoice->tenant_id) {
            throw new AccessDeniedHttpException('Admin só pode acessar cobranças do próprio tenant.');
        }
    }

    private function ensureSupportedProvider(string $provider): void
    {
        if ($provider === 'cora') {
            return;
        }

        $exists = PaymentProvider::query()
            ->where('slug', strtolower(trim($provider)))
            ->exists();

        if (! $exists) {
            abort(404, 'Provedor de pagamento não suportado.');
        }
    }

    public function index(Request $request): JsonResponse
    {
        if (! $request->user()) {
            return $this->forbidden('Não autenticado.');
        }

            $providers = PaymentProvider::query()
                ->select('slug', 'name')
                ->selectRaw('MAX(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as is_active_flag')
                ->whereNull('deleted_at')
                ->groupBy('slug', 'name')
                ->orderBy('name')
                ->get()
                ->map(function ($provider) {
                    $slug = strtolower((string) $provider->slug);

                    return [
                        'slug' => $slug,
                        'name' => (string) $provider->name,
                        'status' => ((int) $provider->is_active_flag) === 1 ? 'active' : 'inactive',
                        'capabilities' => $this->resolveCapabilitiesBySlug($slug),
                    ];
                })
                ->values();

            if ($providers->isEmpty() && TenantCoraCredential::query()->exists()) {
                $providers = collect([
                    [
                        'slug' => 'cora',
                        'name' => 'Cora',
                        'status' => 'active',
                        'capabilities' => $this->resolveCapabilitiesBySlug('cora'),
                    ],
                ]);
            }

            return $this->success($providers->all(), 'Provedores de pagamento carregados com sucesso.');
    }

        /**
         * @return array<int, string>
         */
        private function resolveCapabilitiesBySlug(string $slug): array
        {
            return match ($slug) {
                'cora' => ['pix', 'boleto', 'webhook', 'mtls_cert_upload'],
                default => ['pix', 'boleto'],
            };
        }

    public function settingsSchema(Request $request, Tenant $tenant, string $provider): JsonResponse
    {
        $this->ensureCanManageTenant($request, $tenant);
        $this->ensureSupportedProvider($provider);

        if ($provider !== 'cora') {
            return $this->success([
                'provider' => $provider,
                'configured' => false,
                'environments' => [
                    'stage' => false,
                    'prod' => false,
                ],
                'fields' => [],
            ], 'Schema do provedor carregado com sucesso.');
        }

        $credentials = $tenant->coraCredentials()->orderBy('environment')->get();

        return $this->success([
            'provider' => 'cora',
            'configured' => $credentials->isNotEmpty(),
            'environments' => [
                'stage' => (bool) $credentials->firstWhere('environment', 'stage')?->active,
                'prod' => (bool) $credentials->firstWhere('environment', 'prod')?->active,
            ],
            'fields' => [
                [
                    'name' => 'environment',
                    'label' => 'Ambiente',
                    'type' => 'select',
                    'required' => true,
                    'options' => ['stage', 'prod'],
                ],
                [
                    'name' => 'client_id',
                    'label' => 'Client ID',
                    'type' => 'text',
                    'required' => true,
                ],
                [
                    'name' => 'certificate',
                    'label' => 'Certificado',
                    'type' => 'file',
                    'required' => true,
                    'accept' => ['.pem', '.crt'],
                ],
                [
                    'name' => 'private_key',
                    'label' => 'Chave privada',
                    'type' => 'file',
                    'required' => true,
                    'accept' => ['.key', '.pem'],
                ],
                [
                    'name' => 'test_account_main_cpf',
                    'label' => 'CPF - Conta Principal (Teste)',
                    'type' => 'text',
                    'required' => false,
                    'placeholder' => '451.145.218-02',
                ],
                [
                    'name' => 'test_account_main_password',
                    'label' => 'Senha - Conta Principal (Teste)',
                    'type' => 'password',
                    'required' => false,
                ],
                [
                    'name' => 'test_account_secondary_cpf',
                    'label' => 'CPF - Conta Secundária (Teste)',
                    'type' => 'text',
                    'required' => false,
                    'placeholder' => '576.816.348-43',
                ],
                [
                    'name' => 'test_account_secondary_password',
                    'label' => 'Senha - Conta Secundária (Teste)',
                    'type' => 'password',
                    'required' => false,
                ],
            ],
        ], 'Schema do provedor carregado com sucesso.');
    }

    public function saveSettings(Request $request, Tenant $tenant, string $provider): JsonResponse
    {
        $this->ensureCanManageTenant($request, $tenant);
        $this->ensureSupportedProvider($provider);

        if ($provider !== 'cora') {
            return $this->error('Configuração de credenciais ainda não implementada para este provedor.', [
                'provider' => $provider,
            ], 422);
        }

        $data = $request->validate([
            'client_id' => ['required', 'string', 'max:255'],
            'environment' => ['required', 'string', 'in:stage,prod,production'],
            'certificate' => ['required', 'file', 'max:1024'],
            'private_key' => ['required', 'file', 'max:1024'],
            'test_account_main_cpf' => ['nullable', 'string', 'max:14'],
            'test_account_main_password' => ['nullable', 'string', 'max:255'],
            'test_account_secondary_cpf' => ['nullable', 'string', 'max:14'],
            'test_account_secondary_password' => ['nullable', 'string', 'max:255'],
        ]);

        $normalizedClientId = trim((string) $data['client_id']);

        if ($normalizedClientId === '') {
            return $this->error('client_id inválido para o provedor.', null, 422);
        }

        $environment = $data['environment'] === 'production' ? 'prod' : $data['environment'];

        $baseDir = 'secure/cora/tenants/' . $tenant->id;

        $environmentDir = $environment === 'prod' ? 'production' : 'test';

        $certPath = $request->file('certificate')->storeAs($baseDir . '/' . $environmentDir, 'certificate.pem', 'local');
        $keyPath = $request->file('private_key')->storeAs($baseDir . '/' . $environmentDir, 'private-key.key', 'local');

        TenantCoraCredential::updateOrCreate(
            [
                'tenant_id' => $tenant->id,
                'environment' => $environment,
            ],
            [
                'client_id' => $normalizedClientId,
                'certificate_path' => $certPath,
                'private_key_path' => $keyPath,
                'environment' => $environment,
                'active' => true,
                'configured_at' => now(),
                'test_account_main_cpf' => $data['test_account_main_cpf'] ?? null,
                'test_account_main_password' => $data['test_account_main_password'] ?? null,
                'test_account_secondary_cpf' => $data['test_account_secondary_cpf'] ?? null,
                'test_account_secondary_password' => $data['test_account_secondary_password'] ?? null,
            ]
        );

        return $this->success([
            'provider' => 'cora',
            'configured' => true,
            'environment' => $environment,
            'configured_at' => TenantCoraCredential::where('tenant_id', $tenant->id)->where('environment', $environment)->value('configured_at'),
            'cert_uploaded' => Storage::disk('local')->exists($certPath),
            'key_uploaded' => Storage::disk('local')->exists($keyPath),
        ], 'Configuração do provedor salva com sucesso.');
    }

    public function testConnection(Request $request, Tenant $tenant, string $provider, CoraTokenService $tokenService): JsonResponse
    {
        $this->ensureCanManageTenant($request, $tenant);
        $this->ensureSupportedProvider($provider);

        if ($provider !== 'cora') {
            return $this->error('Teste de conexão ainda não implementado para este provedor.', [
                'provider' => $provider,
                'ok' => false,
                'provider_status' => 'not_implemented',
            ], 422);
        }

        $requestedEnv = (string) $request->input('environment', 'stage');
        $requestedEnv = $requestedEnv === 'production' ? 'prod' : $requestedEnv;

        // Same environment enforcement as generateCharge
        $user = $request->user();
        if (! app()->environment('production')) {
            $environment = 'stage';
        } elseif ($user && $user->isSuperAdmin()) {
            $environment = $requestedEnv ?: 'prod';
        } else {
            $environment = 'prod';
        }

        try {
            $token = $tokenService->generateForTenant($tenant, $environment);
        } catch (ConnectionException|RequestException $e) {
            return $this->error('Erro de comunicação com o provedor.', [
                'provider' => 'cora',
                'environment' => $environment,
                'ok' => false,
                'provider_status' => 'error',
                'error' => $e->getMessage(),
            ], 502);
        } catch (\RuntimeException $e) {
            return $this->error($e->getMessage(), [
                'provider' => 'cora',
                'environment' => $environment,
                'ok' => false,
                'provider_status' => 'invalid_configuration',
            ], 422);
        }

        return $this->success([
            'provider' => 'cora',
            'environment' => $environment,
            'ok' => true,
            'provider_status' => 'connected',
            'expires_in' => $token['expires_in'],
        ], 'Conexão com o provedor validada com sucesso.');
    }

    public function paymentOptions(Request $request, Invoice $invoice): JsonResponse
    {
        $this->ensureCanAccessInvoice($request, $invoice);
        $lockedSyncedMethod  = $this->resolveLockedMethodForSyncedInvoice($invoice);
        $existingStoredMethod = $this->resolveStoredMethodForExistingCharge($invoice);

        // Trava geral: qualquer invoice com cobrança já gerada fica no método original.
        $lockedMethod = $lockedSyncedMethod
            ?? ($invoice->cora_charge_id ? $existingStoredMethod : null);
        $lockReason   = $lockedSyncedMethod !== null
            ? 'synced_charge_method_lock'
            : ($lockedMethod !== null ? 'method_already_charged' : null);

        $pixQrImageUrl = data_get($invoice->cora_payload, 'pix.qr_code_image_url')
            ?? data_get($invoice->cora_payload, 'pix.qr_code_url')
            ?? data_get($invoice->cora_payload, 'payment_options.pix.qr_code_url')
            ?? data_get($invoice->cora_payload, 'qr_code_image_url');

        $currentMethod = match (true) {
            $invoice->payment_method === 'bank_slip' => 'boleto',
            in_array($invoice->payment_method, ['pix', 'boleto'], true) => $invoice->payment_method,
            $lockedMethod === 'bank_slip' => 'boleto',
            in_array($lockedMethod, ['pix', 'boleto'], true) => $lockedMethod,
            default => null,
        };

        $allowedMethods = $lockedMethod === 'bank_slip'
            ? ['boleto']
            : ($lockedMethod === 'pix' ? ['pix'] : ['pix', 'boleto']);

        return $this->success([
            'invoice' => [
                'id'             => $invoice->id,
                'description'    => $invoice->description,
                'amount'         => (string) $invoice->amount,
                'due_date'       => $invoice->due_date?->toDateString(),
                'status'         => $invoice->status,
                'payment_method' => $invoice->payment_method,
            ],
            'allowed_methods' => $allowedMethods,
            'current_method'  => $currentMethod,
            'actions' => [
                'can_generate_charge'  => ! in_array($invoice->status, ['paid', 'cancelled'], true),
                'can_change_method'    => $lockedMethod === null,
                'can_open_boleto_url'  => (bool) $invoice->cora_payment_url,
                'can_copy_boleto_line' => (bool) $invoice->boleto_digitable,
                'can_copy_pix_code'    => (bool) $invoice->cora_pix_copy_paste,
            ],
            'method_lock' => [
                'locked' => $lockedMethod !== null,
                'method' => $lockedMethod === 'bank_slip' ? 'boleto' : $lockedMethod,
                'reason' => $lockReason,
            ],
            'payment_assets' => [
                'charge_id'       => $invoice->cora_charge_id,
                'charge_status'   => $invoice->cora_status,
                'boleto_number'   => $invoice->boleto_number,
                'boleto_digitable'=> $invoice->boleto_digitable,
                'boleto_url'      => $invoice->cora_payment_url,
                'pix_copy_paste'  => $invoice->cora_pix_copy_paste,
                'pix_qr_image_url'=> $pixQrImageUrl,
                'last_synced_at'  => $invoice->cora_last_synced_at?->toISOString(),
            ],
        ], 'Opções de pagamento carregadas com sucesso.');
    }

    public function generateCharge(Request $request, Invoice $invoice, PaymentGatewayFactory $factory): JsonResponse
    {
        $this->ensureCanAccessInvoice($request, $invoice);

        $data = $request->validate([
            'provider' => ['required', 'string', 'in:cora'],
            'method' => ['nullable', 'string', 'in:pix,boleto,bank_slip'],
            'environment' => ['nullable', 'string', 'in:stage,prod,production'],
        ]);

        $requestedEnv = $data['environment'] ?? 'stage';
        $requestedEnv = $requestedEnv === 'production' ? 'prod' : $requestedEnv;

        // Enforce environment based on app environment:
        //   - Not production → always stage
        //   - Production + not super_admin → always prod
        //   - Production + super_admin → honor request (default prod)
        $user = $request->user();
        if (! app()->environment('production')) {
            $environment = 'stage';
        } elseif ($user && $user->isSuperAdmin()) {
            $environment = $requestedEnv ?: 'prod';
        } else {
            $environment = 'prod';
        }

        $requestedMethodRaw = strtolower((string) ($data['method'] ?? ''));
        $requestedMethod = in_array($requestedMethodRaw, ['pix', 'boleto', 'bank_slip'], true)
            ? $requestedMethodRaw
            : '';
        $requestedStoredMethod = $requestedMethod !== ''
            ? (in_array($requestedMethod, ['boleto', 'bank_slip'], true) ? 'bank_slip' : 'pix')
            : null;
        $existingStoredMethod = $this->resolveStoredMethodForExistingCharge($invoice);
        $lockedSyncedMethod = $this->resolveLockedMethodForSyncedInvoice($invoice);

        if ($lockedSyncedMethod !== null && $requestedStoredMethod !== null && $requestedStoredMethod !== $lockedSyncedMethod) {
            Log::info('PaymentProviderController generateCharge blocked by synced method lock', [
                'invoice_id' => $invoice->id,
                'tenant_id' => $invoice->tenant_id,
                'requested_method' => $requestedStoredMethod,
                'locked_method' => $lockedSyncedMethod,
                'cora_charge_id' => $invoice->cora_charge_id,
            ]);

            return $this->error(
                'Esta cobrança foi sincronizada e deve manter o método original.',
                [
                    'provider' => 'cora',
                    'requested_method' => $requestedStoredMethod,
                    'locked_method' => $lockedSyncedMethod,
                    'locked_reason' => 'synced_charge_method_lock',
                ],
                422
            );
        }

        // Trava geral: qualquer invoice com cobrança já gerada não pode trocar de método.
        if ($lockedSyncedMethod === null
            && $existingStoredMethod !== null
            && $requestedStoredMethod !== null
            && $requestedStoredMethod !== $existingStoredMethod
        ) {
            Log::info('PaymentProviderController generateCharge blocked by method_already_charged lock', [
                'invoice_id' => $invoice->id,
                'tenant_id' => $invoice->tenant_id,
                'requested_method' => $requestedStoredMethod,
                'locked_method' => $existingStoredMethod,
                'cora_charge_id' => $invoice->cora_charge_id,
            ]);

            return $this->error(
                'Não é possível alterar o método de pagamento de uma cobrança já gerada.',
                [
                    'provider' => 'cora',
                    'requested_method' => $requestedStoredMethod,
                    'locked_method' => $existingStoredMethod,
                    'locked_reason' => 'method_already_charged',
                ],
                422
            );
        }

        $reusableCharge = $this->resolveReusableCharge($invoice, $requestedStoredMethod);

        Log::info('PaymentProviderController generateCharge called', [
            'invoice_id' => $invoice->id,
            'tenant_id' => $invoice->tenant_id,
            'provider' => $data['provider'],
            'requested_method' => $requestedMethod !== '' ? $requestedMethod : null,
            'resolved_method' => $requestedStoredMethod,
            'existing_method' => $existingStoredMethod,
            'environment' => $environment,
        ]);

        if (in_array($invoice->status, ['paid', 'cancelled'], true)) {
            return $this->error('Não é possível gerar cobrança para fatura paga ou cancelada.', null, 422);
        }

        if ($reusableCharge) {
            if (($reusableCharge['source'] ?? 'current') === 'history') {
                $invoice->update([
                    'payment_method' => $reusableCharge['method'],
                    'cora_charge_id' => $reusableCharge['charge_id'],
                    'cora_status' => $reusableCharge['status'],
                    'cora_payment_url' => $reusableCharge['payment_url'],
                    'cora_pix_copy_paste' => $reusableCharge['pix_copy_paste'],
                    'boleto_number' => $reusableCharge['boleto_number'],
                    'boleto_digitable' => $reusableCharge['boleto_digitable'],
                    'cora_last_synced_at' => now(),
                ]);

                $invoice->refresh();
            }

            Log::info('PaymentProviderController generateCharge reused existing charge', [
                'invoice_id' => $invoice->id,
                'tenant_id' => $invoice->tenant_id,
                'provider' => 'cora',
                'environment' => $environment,
                'requested_method' => $requestedStoredMethod,
                'reused_method' => $reusableCharge['method'],
                'source' => $reusableCharge['source'] ?? 'current',
                'charge_id' => $reusableCharge['charge_id'],
                'status' => $reusableCharge['status'],
            ]);

            return $this->success([
                'invoice_id' => $invoice->id,
                'provider' => 'cora',
                'environment' => $environment,
                'method' => $reusableCharge['method'],
                'charge_id' => $reusableCharge['charge_id'],
                'status' => $reusableCharge['status'],
                'payment_url' => $reusableCharge['payment_url'],
                'pix_copy_paste' => $reusableCharge['pix_copy_paste'],
                'boleto_number' => $reusableCharge['boleto_number'],
                'boleto_digitable' => $reusableCharge['boleto_digitable'],
                'qr_code_image_url' => $reusableCharge['qr_code_image_url'],
                'expires_at' => null,
                'reused_existing_charge' => true,
            ], 'Cobrança existente reutilizada com sucesso.');
        }

        if ($requestedStoredMethod !== null && $existingStoredMethod !== null && $requestedStoredMethod !== $existingStoredMethod) {
            Log::info('PaymentProviderController generateCharge creating new charge due to method change', [
                'invoice_id' => $invoice->id,
                'tenant_id' => $invoice->tenant_id,
                'provider' => 'cora',
                'environment' => $environment,
                'requested_method' => $requestedStoredMethod,
                'existing_method' => $existingStoredMethod,
                'existing_charge_id' => $invoice->cora_charge_id,
            ]);
        }

        $storedMethod = $lockedSyncedMethod ?? $requestedStoredMethod ?? $existingStoredMethod ?? 'pix';
        $coraMethod = $storedMethod === 'bank_slip' ? 'boleto' : 'pix';

        try {
            $result = $factory->resolve('cora')->createCharge($invoice, $environment, $coraMethod);
        } catch (ConnectionException|RequestException $e) {
            $status = $e instanceof RequestException ? ($e->response?->status() ?? 502) : 502;
            $providerCode = $e instanceof RequestException ? (string) ($e->response?->json('code') ?? '') : '';
            $providerMessage = $e instanceof RequestException ? (string) ($e->response?->json('message') ?? '') : '';
            $providerError = $e instanceof RequestException ? (string) ($e->response?->json('error') ?? '') : '';

            $userMessage = 'Erro ao comunicar com o provedor.';
            $httpStatus = 502;

            if ($status >= 400 && $status < 500) {
                $httpStatus = 422;
                $userMessage = $providerMessage !== ''
                    ? $providerMessage
                    : ($providerError !== '' ? $providerError : 'Falha de validação retornada pelo provedor.');
            }

            Log::warning('PaymentProviderController generateCharge communication error', [
                'invoice_id' => $invoice->id,
                'tenant_id' => $invoice->tenant_id,
                'provider' => $data['provider'],
                'environment' => $environment,
                'method' => $coraMethod,
                'status' => $status,
                'provider_code' => $providerCode,
                'provider_message' => $providerMessage,
                'provider_error' => $providerError,
                'error' => $e->getMessage(),
            ]);

            return $this->error($userMessage, [
                'provider' => $data['provider'],
                'environment' => $environment,
                'method' => $coraMethod,
                'provider_code' => $providerCode !== '' ? $providerCode : null,
                'provider_message' => $providerMessage !== '' ? $providerMessage : null,
                'provider_error' => $providerError !== '' ? $providerError : null,
                'error' => $e->getMessage(),
            ], $httpStatus);
        } catch (\RuntimeException $e) {
            Log::warning('PaymentProviderController generateCharge runtime error', [
                'invoice_id' => $invoice->id,
                'tenant_id' => $invoice->tenant_id,
                'provider' => $data['provider'],
                'environment' => $environment,
                'method' => $coraMethod,
                'error' => $e->getMessage(),
            ]);

            return $this->error($e->getMessage(), null, 422);
        }

        $existingSnapshot = $this->buildChargeSnapshotFromInvoice($invoice, $existingStoredMethod);
        $methodCharges = $this->extractMethodCharges($invoice->cora_payload);

        if ($existingSnapshot) {
            $methodCharges[$existingSnapshot['method']] = $existingSnapshot;
        }

        $newSnapshot = [
            'method' => $storedMethod,
            'charge_id' => $result['external_id'],
            'status' => $result['status'],
            'payment_url' => $result['payment_url'],
            'pix_copy_paste' => $result['pix_copy_paste'],
            'boleto_number' => $result['boleto_number'],
            'boleto_digitable' => $result['boleto_digitable'],
            'qr_code_image_url' => $result['qr_code_image_url']
                ?? data_get($result['payload'], 'pix.qr_code_image_url')
                ?? data_get($result['payload'], 'pix.qr_code_url')
                ?? data_get($result['payload'], 'payment_options.pix.qr_code_url')
                ?? data_get($result['payload'], 'qr_code_image_url'),
        ];
        $methodCharges[$storedMethod] = $newSnapshot;

        $payloadToPersist = is_array($result['payload']) ? $result['payload'] : [];
        $payloadToPersist['method_charges'] = $methodCharges;

        $invoice->update([
            'payment_method' => $storedMethod,
            'cora_charge_id' => $result['external_id'],
            'cora_status' => $result['status'],
            'cora_payment_url' => $result['payment_url'],
            'cora_pix_copy_paste' => $result['pix_copy_paste'],
            'boleto_number' => $result['boleto_number'],
            'boleto_digitable' => $result['boleto_digitable'],
            'cora_payload' => $payloadToPersist,
            'cora_last_synced_at' => now(),
        ]);

        Log::info('PaymentProviderController generateCharge succeeded', [
            'invoice_id' => $invoice->id,
            'tenant_id' => $invoice->tenant_id,
            'provider' => 'cora',
            'environment' => $environment,
            'method' => $storedMethod,
            'charge_id' => $invoice->fresh()->cora_charge_id,
            'status' => $invoice->fresh()->cora_status,
        ]);

        return $this->success([
            'invoice_id' => $invoice->id,
            'provider' => 'cora',
            'environment' => $environment,
            'method' => $storedMethod,
            'charge_id' => $invoice->fresh()->cora_charge_id,
            'status' => $invoice->fresh()->cora_status,
            'payment_url' => $invoice->fresh()->cora_payment_url,
            'pix_copy_paste' => $invoice->fresh()->cora_pix_copy_paste,
            'boleto_number' => $invoice->fresh()->boleto_number,
            'boleto_digitable' => $invoice->fresh()->boleto_digitable,
            'qr_code_image_url' => $result['qr_code_image_url']
                ?? data_get($invoice->fresh()->cora_payload, 'pix.qr_code_image_url')
                ?? data_get($invoice->fresh()->cora_payload, 'pix.qr_code_url')
                ?? data_get($invoice->fresh()->cora_payload, 'payment_options.pix.qr_code_url'),
            'expires_at' => null,
            'reused_existing_charge' => false,
        ], 'Cobrança gerada com sucesso.');
    }

    private function shouldReuseExistingCharge(Invoice $invoice, ?string $storedMethod): bool
    {
        if (! $storedMethod) {
            return false;
        }

        if (! $invoice->cora_charge_id) {
            return false;
        }

        $providerStatus = strtoupper(trim((string) $invoice->cora_status));

        if (! in_array($providerStatus, ['OPEN', 'PENDING', 'PROCESSING', 'CREATED'], true)) {
            return false;
        }

        return true;
    }

    private function resolveStoredMethodForExistingCharge(Invoice $invoice): ?string
    {
        $paymentMethod = strtolower((string) $invoice->payment_method);

        if (in_array($paymentMethod, ['boleto', 'bank_slip'], true)) {
            return 'bank_slip';
        }

        if ($paymentMethod === 'pix') {
            return 'pix';
        }

        if ($invoice->boleto_digitable || $invoice->boleto_number || $invoice->cora_payment_url) {
            return 'bank_slip';
        }

        if ($invoice->cora_pix_copy_paste) {
            return 'pix';
        }

        return null;
    }

    private function resolveReusableCharge(Invoice $invoice, ?string $requestedStoredMethod): ?array
    {
        $currentStoredMethod = $this->resolveStoredMethodForExistingCharge($invoice);
        $currentSnapshot = $this->buildChargeSnapshotFromInvoice($invoice, $currentStoredMethod);

        if ($currentSnapshot
            && ($requestedStoredMethod === null || $requestedStoredMethod === $currentSnapshot['method'])
            && $this->isReusableChargeStatus($currentSnapshot['status'])) {
            $currentSnapshot['source'] = 'current';

            return $currentSnapshot;
        }

        if ($requestedStoredMethod === null) {
            return null;
        }

        $methodCharges = $this->extractMethodCharges($invoice->cora_payload);
        $candidate = $methodCharges[$requestedStoredMethod] ?? null;

        if (! is_array($candidate)) {
            return null;
        }

        $chargeId = (string) ($candidate['charge_id'] ?? '');
        $status = isset($candidate['status']) ? strtoupper(trim((string) $candidate['status'])) : '';

        if ($chargeId === '' || ! $this->isReusableChargeStatus($status)) {
            return null;
        }

        return [
            'method' => $requestedStoredMethod,
            'charge_id' => $chargeId,
            'status' => $status,
            'payment_url' => isset($candidate['payment_url']) ? (string) $candidate['payment_url'] : null,
            'pix_copy_paste' => isset($candidate['pix_copy_paste']) ? (string) $candidate['pix_copy_paste'] : null,
            'boleto_number' => isset($candidate['boleto_number']) ? (string) $candidate['boleto_number'] : null,
            'boleto_digitable' => isset($candidate['boleto_digitable']) ? (string) $candidate['boleto_digitable'] : null,
            'qr_code_image_url' => isset($candidate['qr_code_image_url']) ? (string) $candidate['qr_code_image_url'] : null,
            'source' => 'history',
        ];
    }

    private function buildChargeSnapshotFromInvoice(Invoice $invoice, ?string $storedMethod): ?array
    {
        if (! $storedMethod || ! $invoice->cora_charge_id) {
            return null;
        }

        return [
            'method' => $storedMethod,
            'charge_id' => $invoice->cora_charge_id,
            'status' => $invoice->cora_status,
            'payment_url' => $invoice->cora_payment_url,
            'pix_copy_paste' => $invoice->cora_pix_copy_paste,
            'boleto_number' => $invoice->boleto_number,
            'boleto_digitable' => $invoice->boleto_digitable,
            'qr_code_image_url' => data_get($invoice->cora_payload, 'pix.qr_code_image_url')
                ?? data_get($invoice->cora_payload, 'pix.qr_code_url')
                ?? data_get($invoice->cora_payload, 'payment_options.pix.qr_code_url')
                ?? data_get($invoice->cora_payload, 'qr_code_image_url'),
        ];
    }

    private function extractMethodCharges(mixed $payload): array
    {
        if (! is_array($payload)) {
            return [];
        }

        $methodCharges = $payload['method_charges'] ?? [];

        return is_array($methodCharges) ? $methodCharges : [];
    }

    private function resolveLockedMethodForSyncedInvoice(Invoice $invoice): ?string
    {
        if (! $invoice->cora_charge_id) {
            return null;
        }

        $payload = is_array($invoice->cora_payload) ? $invoice->cora_payload : [];
        $origin = strtolower(trim((string) data_get($payload, 'integration.origin')));
        $methodLocked = (bool) data_get($payload, 'integration.method_locked', false);
        $originalMethod = strtolower(trim((string) data_get($payload, 'integration.original_method')));

        if ($origin === 'cora_sync' && $methodLocked) {
            if (in_array($originalMethod, ['pix', 'bank_slip'], true)) {
                return $originalMethod;
            }

            return $this->resolveStoredMethodForExistingCharge($invoice);
        }

        // Regra de compatibilidade para registros sincronizados legados.
        $hasLocalInvoiceMetadata = data_get($payload, 'metadata.invoice_id') !== null;
        $looksLikeImported = str_contains(strtolower((string) $invoice->description), 'importada');

        if (! $hasLocalInvoiceMetadata && $looksLikeImported) {
            return $this->resolveStoredMethodForExistingCharge($invoice);
        }

        return null;
    }

    private function isReusableChargeStatus(?string $status): bool
    {
        $providerStatus = strtoupper(trim((string) $status));

        return in_array($providerStatus, ['OPEN', 'PENDING', 'PROCESSING', 'CREATED'], true);
    }

    public function chargeStatus(Request $request, Invoice $invoice, PaymentGatewayFactory $factory): JsonResponse
    {
        $this->ensureCanAccessInvoice($request, $invoice);

        if (! $invoice->cora_charge_id) {
            return $this->success([
                'provider' => null,
                'status' => $invoice->cora_status,
                'paid_at' => $invoice->paid_at?->toISOString(),
            ], 'Status da cobrança carregado com sucesso.');
        }

        $data = $request->validate([
            'environment' => ['nullable', 'string', 'in:stage,prod,production'],
        ]);

        $requestedEnv = $data['environment'] ?? 'stage';
        $requestedEnv = $requestedEnv === 'production' ? 'prod' : $requestedEnv;

        $user = $request->user();
        if (! app()->environment('production')) {
            $environment = 'stage';
        } elseif ($user && $user->isSuperAdmin()) {
            $environment = $requestedEnv ?: 'prod';
        } else {
            $environment = 'prod';
        }

        $invoice->loadMissing('tenant');

        if (! $invoice->tenant) {
            return $this->error('Tenant da fatura não encontrado para consulta no provedor.', null, 422);
        }

        try {
            $externalInvoice = $factory->resolve('cora')->getInvoiceById(
                $invoice->tenant,
                (string) $invoice->cora_charge_id,
                $environment
            );
        } catch (ConnectionException|RequestException $e) {
            $status = $e instanceof RequestException ? ($e->response?->status() ?? 502) : 502;
            $providerCode = $e instanceof RequestException ? (string) ($e->response?->json('code') ?? '') : '';
            $providerMessage = $e instanceof RequestException ? (string) ($e->response?->json('message') ?? '') : '';
            $providerError = $e instanceof RequestException ? (string) ($e->response?->json('error') ?? '') : '';

            $userMessage = 'Erro ao consultar status no provedor.';
            $httpStatus = 502;

            if ($status >= 400 && $status < 500) {
                $httpStatus = 422;
                $userMessage = $providerMessage !== ''
                    ? $providerMessage
                    : ($providerError !== '' ? $providerError : 'Falha de validação retornada pelo provedor.');
            }

            Log::warning('PaymentProviderController chargeStatus communication error', [
                'invoice_id' => $invoice->id,
                'tenant_id' => $invoice->tenant_id,
                'environment' => $environment,
                'cora_charge_id' => $invoice->cora_charge_id,
                'status' => $status,
                'provider_code' => $providerCode,
                'provider_message' => $providerMessage,
                'provider_error' => $providerError,
                'error' => $e->getMessage(),
            ]);

            return $this->error($userMessage, [
                'provider' => 'cora',
                'environment' => $environment,
                'provider_code' => $providerCode !== '' ? $providerCode : null,
                'provider_message' => $providerMessage !== '' ? $providerMessage : null,
                'provider_error' => $providerError !== '' ? $providerError : null,
                'error' => $e->getMessage(),
            ], $httpStatus);
        } catch (\RuntimeException $e) {
            Log::warning('PaymentProviderController chargeStatus runtime error', [
                'invoice_id' => $invoice->id,
                'tenant_id' => $invoice->tenant_id,
                'environment' => $environment,
                'cora_charge_id' => $invoice->cora_charge_id,
                'error' => $e->getMessage(),
            ]);

            return $this->error($e->getMessage(), null, 422);
        }

        $providerStatus = strtoupper(trim((string) ($externalInvoice['status'] ?? $invoice->cora_status ?? '')));
        $providerPaidAt = $this->extractProviderPaidAt($externalInvoice);
        $localStatus = $this->mapProviderStatusToInvoiceStatus($providerStatus, $invoice->status);

        $existingPayload = is_array($invoice->cora_payload) ? $invoice->cora_payload : [];

        $updates = [
            'cora_status' => $providerStatus !== '' ? $providerStatus : $invoice->cora_status,
            'cora_payload' => array_merge($existingPayload, [
                'latest_status_snapshot' => $externalInvoice,
                'last_status_check' => [
                    'environment' => $environment,
                    'checked_at' => now()->toISOString(),
                ],
            ]),
            'cora_last_synced_at' => now(),
        ];

        if ($localStatus === 'paid') {
            $updates['status'] = 'paid';
            $updates['paid_at'] = $providerPaidAt ?? $invoice->paid_at ?? now();
        } elseif ($localStatus === 'cancelled' && $invoice->status !== 'paid') {
            $updates['status'] = 'cancelled';
        } elseif ($localStatus === 'pending' && ! in_array($invoice->status, ['paid', 'cancelled'], true)) {
            $updates['status'] = 'pending';
        }

        $invoice->update($updates);
        $invoice->refresh();

        Log::info('PaymentProviderController chargeStatus synced', [
            'invoice_id' => $invoice->id,
            'tenant_id' => $invoice->tenant_id,
            'environment' => $environment,
            'cora_charge_id' => $invoice->cora_charge_id,
            'provider_status' => $providerStatus,
            'local_status' => $invoice->status,
            'paid_at' => $invoice->paid_at?->toISOString(),
        ]);

        return $this->success([
            'provider' => $invoice->cora_charge_id ? 'cora' : null,
            'status' => $invoice->cora_status,
            'paid_at' => $invoice->paid_at?->toISOString(),
        ], 'Status da cobrança carregado com sucesso.');
    }

    /**
     * @param array<string, mixed> $externalInvoice
     */
    private function extractProviderPaidAt(array $externalInvoice): ?Carbon
    {
        $candidates = [
            $externalInvoice['paid_at'] ?? null,
            data_get($externalInvoice, 'payment.paid_at'),
            data_get($externalInvoice, 'payment_date'),
            data_get($externalInvoice, 'paidAt'),
        ];

        foreach ($candidates as $candidate) {
            if (! is_string($candidate) || trim($candidate) === '') {
                continue;
            }

            try {
                return Carbon::parse($candidate);
            } catch (\Throwable) {
                continue;
            }
        }

        return null;
    }

    private function mapProviderStatusToInvoiceStatus(string $providerStatus, string $currentStatus): string
    {
        $normalized = strtoupper(trim($providerStatus));

        if (in_array($normalized, ['PAID', 'IN_PAYMENT', 'COMPLETED', 'RECEIVED'], true)) {
            return 'paid';
        }

        if (in_array($normalized, ['CANCELLED', 'CANCELED', 'VOIDED', 'EXPIRED'], true)) {
            return 'cancelled';
        }

        if (in_array($normalized, ['OPEN', 'PENDING', 'PROCESSING', 'CREATED'], true)) {
            return 'pending';
        }

        return $currentStatus;
    }

    public function payCharge(Request $request, Invoice $invoice, PaymentGatewayFactory $factory): JsonResponse
    {
        $this->ensureCanAccessInvoice($request, $invoice);

        $data = $request->validate([
            'environment' => ['nullable', 'string', 'in:stage,prod,production'],
        ]);

        $environment = $data['environment'] ?? 'stage';
        $environment = $environment === 'production' ? 'prod' : $environment;

        Log::info('PaymentProviderController payCharge called', [
            'invoice_id' => $invoice->id,
            'tenant_id' => $invoice->tenant_id,
            'environment' => $environment,
            'cora_charge_id' => $invoice->cora_charge_id,
        ]);

        // Apenas em stage para testes
        if ($environment !== 'stage') {
            return $this->error('Pagamento de cobrança (teste) disponível apenas em stage.', null, 422);
        }

        if (! $invoice->cora_charge_id) {
            return $this->error('Fatura sem ID de cobrança Cora. Gere a cobrança primeiro.', null, 422);
        }

        if ($invoice->status === 'paid') {
            return $this->error('Fatura já está paga.', null, 422);
        }

        if ($invoice->status === 'cancelled') {
            return $this->error('Não é possível pagar uma fatura cancelada.', null, 422);
        }

        try {
            $result = $factory->resolve('cora')->payCharge($invoice, $environment);
        } catch (ConnectionException|RequestException $e) {
            $status = $e instanceof RequestException ? ($e->response?->status() ?? 502) : 502;
            $providerCode = $e instanceof RequestException ? (string) ($e->response?->json('code') ?? '') : '';
            $providerMessage = $e instanceof RequestException ? (string) ($e->response?->json('message') ?? '') : '';
            $providerError = $e instanceof RequestException ? (string) ($e->response?->json('error') ?? '') : '';

            $userMessage = 'Erro ao comunicar com o provedor.';
            $httpStatus = 502;

            if ($status >= 400 && $status < 500) {
                $httpStatus = 422;
                $userMessage = $providerMessage !== ''
                    ? $providerMessage
                    : ($providerError !== '' ? $providerError : 'Falha de validação retornada pelo provedor.');
            }

            Log::warning('PaymentProviderController payCharge communication error', [
                'invoice_id' => $invoice->id,
                'tenant_id' => $invoice->tenant_id,
                'environment' => $environment,
                'status' => $status,
                'provider_code' => $providerCode,
                'provider_message' => $providerMessage,
                'provider_error' => $providerError,
                'error' => $e->getMessage(),
            ]);

            return $this->error($userMessage, [
                'provider' => 'cora',
                'environment' => $environment,
                'provider_code' => $providerCode !== '' ? $providerCode : null,
                'provider_message' => $providerMessage !== '' ? $providerMessage : null,
                'provider_error' => $providerError !== '' ? $providerError : null,
                'error' => $e->getMessage(),
            ], $httpStatus);
        } catch (\RuntimeException $e) {
            Log::warning('PaymentProviderController payCharge runtime error', [
                'invoice_id' => $invoice->id,
                'tenant_id' => $invoice->tenant_id,
                'environment' => $environment,
                'error' => $e->getMessage(),
            ]);

            return $this->error($e->getMessage(), null, 422);
        }

        // Atualizar status da fatura baseado na resposta da Cora
        $paidAt = $result['paid_at'] ? new \DateTime($result['paid_at']) : now();

        $invoice->update([
            'status' => 'paid',
            'paid_at' => $paidAt,
            'cora_status' => $result['status'],
            'cora_payload' => $result['payload'],
            'cora_last_synced_at' => now(),
        ]);

        Log::info('PaymentProviderController payCharge succeeded', [
            'invoice_id' => $invoice->id,
            'tenant_id' => $invoice->tenant_id,
            'environment' => $environment,
            'status' => $invoice->fresh()->cora_status,
            'paid_at' => $invoice->fresh()->paid_at?->toISOString(),
        ]);

        return $this->success([
            'invoice_id' => $invoice->id,
            'provider' => 'cora',
            'environment' => $environment,
            'status' => $invoice->fresh()->cora_status,
            'paid_at' => $invoice->fresh()->paid_at?->toISOString(),
        ], 'Cobrança paga com sucesso.');
    }
}

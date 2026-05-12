<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\InvoiceResource;
use App\Models\Invoice;
use App\Models\Tenant;
use App\Models\TenantCoraCredential;
use App\Services\CoraPaymentService;
use App\Services\CoraTokenService;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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
        if ($provider !== 'cora') {
            abort(404, 'Provedor de pagamento não suportado.');
        }
    }

    public function index(Request $request): JsonResponse
    {
        if (! $request->user()) {
            return $this->forbidden('Não autenticado.');
        }

        return $this->success([
            [
                'slug' => 'cora',
                'name' => 'Cora',
                'status' => 'active',
                'capabilities' => ['pix', 'boleto', 'webhook', 'mtls_cert_upload'],
            ],
        ], 'Provedores de pagamento carregados com sucesso.');
    }

    public function settingsSchema(Request $request, Tenant $tenant, string $provider): JsonResponse
    {
        $this->ensureCanManageTenant($request, $tenant);
        $this->ensureSupportedProvider($provider);

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
                'client_id' => $data['client_id'],
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

        $environment = (string) $request->input('environment', 'stage');

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

    public function generateCharge(Request $request, Invoice $invoice, CoraPaymentService $cora): JsonResponse
    {
        $this->ensureCanAccessInvoice($request, $invoice);

        $data = $request->validate([
            'provider' => ['required', 'string', 'in:cora'],
            'method' => ['nullable', 'string', 'in:pix,boleto,bank_slip'],
            'environment' => ['nullable', 'string', 'in:stage,prod,production'],
        ]);

        $environment = $data['environment'] ?? 'stage';
        $environment = $environment === 'production' ? 'prod' : $environment;
        $requestedMethod = strtolower((string) ($data['method'] ?? 'pix'));
        $coraMethod = in_array($requestedMethod, ['boleto', 'bank_slip'], true) ? 'boleto' : 'pix';
        $storedMethod = $coraMethod === 'boleto' ? 'bank_slip' : 'pix';

        if (in_array($invoice->status, ['paid', 'cancelled'], true)) {
            return $this->error('Não é possível gerar cobrança para fatura paga ou cancelada.', null, 422);
        }

        try {
            $result = $cora->createCharge($invoice, $environment, $coraMethod);
        } catch (ConnectionException|RequestException $e) {
            return $this->error('Erro ao comunicar com o provedor.', [
                'provider' => $data['provider'],
                'environment' => $environment,
                'method' => $coraMethod,
                'error' => $e->getMessage(),
            ], 502);
        } catch (\RuntimeException $e) {
            return $this->error($e->getMessage(), null, 422);
        }

        $invoice->update([
            'payment_method' => $invoice->payment_method ?? $storedMethod,
            'cora_charge_id' => $result['external_id'],
            'cora_status' => $result['status'],
            'cora_payment_url' => $result['payment_url'],
            'cora_pix_copy_paste' => $result['pix_copy_paste'],
            'cora_payload' => $result['payload'],
            'cora_last_synced_at' => now(),
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
            'qr_code_image_url' => null,
            'expires_at' => null,
        ], 'Cobrança gerada com sucesso.');
    }

    public function chargeStatus(Request $request, Invoice $invoice): JsonResponse
    {
        $this->ensureCanAccessInvoice($request, $invoice);

        return $this->success([
            'provider' => $invoice->cora_charge_id ? 'cora' : null,
            'status' => $invoice->cora_status,
            'paid_at' => $invoice->paid_at?->toISOString(),
        ], 'Status da cobrança carregado com sucesso.');
    }
}

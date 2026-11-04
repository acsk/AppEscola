<?php

namespace App\Services;

use App\Models\Tenant;
use App\Models\TenantCoraCredential;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

class CoraCredentialService
{
    public function normalizeEnvironment(string $environment): string
    {
        $normalized = strtolower(trim($environment));

        return in_array($normalized, ['prod', 'production'], true) ? 'prod' : 'stage';
    }

    public function credentialHasStoredFiles(TenantCoraCredential $credential): bool
    {
        $certPath = trim((string) $credential->certificate_path);
        $keyPath = trim((string) $credential->private_key_path);

        if ($certPath === '' || $keyPath === '') {
            return false;
        }

        return Storage::disk('local')->exists($certPath)
            && Storage::disk('local')->exists($keyPath);
    }

    /**
     * @return array{
     *     credential: TenantCoraCredential,
     *     environment: string,
     *     cert_uploaded: bool,
     *     key_uploaded: bool
     * }
     */
    public function persistFromRequest(Tenant $tenant, Request $request): array
    {
        $environmentInput = (string) $request->input('environment', 'stage');
        $environment = $this->normalizeEnvironment(
            $environmentInput === 'production' ? 'prod' : $environmentInput
        );

        $existing = TenantCoraCredential::query()
            ->where('tenant_id', $tenant->id)
            ->where('environment', $environment)
            ->first();

        $hasStoredFiles = $existing instanceof TenantCoraCredential
            && $this->credentialHasStoredFiles($existing);

        $data = $request->validate([
            'client_id' => ['required', 'string', 'max:255'],
            'environment' => ['required', 'string', 'in:stage,prod,production'],
            'certificate' => [$hasStoredFiles ? 'nullable' : 'required', 'file', 'max:2048'],
            'private_key' => [$hasStoredFiles ? 'nullable' : 'required', 'file', 'max:2048'],
            'test_account_main_cpf' => ['nullable', 'string', 'max:14'],
            'test_account_main_password' => ['nullable', 'string', 'max:255'],
            'test_account_secondary_cpf' => ['nullable', 'string', 'max:14'],
            'test_account_secondary_password' => ['nullable', 'string', 'max:255'],
        ]);

        $normalizedClientId = trim((string) $data['client_id']);

        if ($normalizedClientId === '') {
            throw new RuntimeException('client_id inválido para o provedor.');
        }

        $baseDir = 'secure/cora/tenants/' . $tenant->id;
        $environmentDir = $environment === 'prod' ? 'production' : 'test';
        $storageDir = $baseDir . '/' . $environmentDir;

        $certPath = $existing?->certificate_path;
        $keyPath = $existing?->private_key_path;

        if ($request->hasFile('certificate')) {
            $certPath = $request->file('certificate')->storeAs($storageDir, 'certificate.pem', 'local');
        }

        if ($request->hasFile('private_key')) {
            $keyPath = $request->file('private_key')->storeAs($storageDir, 'private-key.key', 'local');
        }

        $certPath = trim((string) $certPath);
        $keyPath = trim((string) $keyPath);

        if ($certPath === '' || $keyPath === '') {
            throw new RuntimeException('Certificado e chave privada são obrigatórios para este ambiente.');
        }

        if (! Storage::disk('local')->exists($certPath) || ! Storage::disk('local')->exists($keyPath)) {
            throw new RuntimeException(
                'Arquivos de certificado/chave não encontrados no storage. Envie novamente o certificado e a chave privada.'
            );
        }

        $credential = TenantCoraCredential::updateOrCreate(
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

        return [
            'credential' => $credential,
            'environment' => $environment,
            'cert_uploaded' => Storage::disk('local')->exists($certPath),
            'key_uploaded' => Storage::disk('local')->exists($keyPath),
        ];
    }
}

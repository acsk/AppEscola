<?php

namespace App\Console\Commands;

use App\Models\CoraWebhookEndpoint;
use App\Models\Tenant;
use App\Services\Gateways\CoraPaymentGateway;
use Illuminate\Console\Command;
use Illuminate\Support\Str;
use Throwable;

/**
 * Cadastra na Cora a assinatura do webhook de cobranças de um tenant.
 *
 * Gera uma chave opaca aleatória para a URL (só o hash fica no banco) e reaproveita a Idempotency-Key
 * se o comando for repetido com --idempotency-key após uma resposta perdida.
 */
class RegisterCoraWebhookCommand extends Command
{
    protected $signature = 'cora:webhook-register
                            {tenant : ID do tenant}
                            {--environment=stage : Ambiente Cora (stage ou prod)}
                            {--trigger= : Evento de cobrança: paid, created, overdue, canceled, drafted ou * (padrão: *)}
                            {--base-url= : URL pública da API (padrão: APP_URL)}
                            {--idempotency-key= : Reutilize a chave de uma tentativa anterior sem resposta}
                            {--dry-run : Mostra o que seria enviado, sem chamar a Cora}';

    protected $description = 'Cadastra a assinatura do webhook de cobranças (invoice) na Cora para um tenant';

    private const TRIGGERS = ['paid', 'created', 'overdue', 'canceled', 'drafted', '*'];

    public function handle(CoraPaymentGateway $gateway): int
    {
        $tenant = Tenant::query()->find((int) $this->argument('tenant'));
        if (! $tenant) {
            $this->error('Tenant não encontrado.');

            return self::FAILURE;
        }

        $environment = $this->option('environment') === 'prod' ? 'prod' : 'stage';
        $trigger = (string) ($this->option('trigger') ?: '*');
        if (! in_array($trigger, self::TRIGGERS, true)) {
            $this->error('Trigger inválido. Use: ' . implode(', ', self::TRIGGERS));

            return self::FAILURE;
        }

        $active = CoraWebhookEndpoint::query()
            ->where('tenant_id', $tenant->id)
            ->where('environment', $environment)
            ->where('active', true)
            ->exists();
        if ($active && ! $this->confirm('Já existe assinatura ativa para este tenant e ambiente. Cadastrar outra mesmo assim?')) {
            return self::FAILURE;
        }

        $callbackKey = Str::random(48);
        $baseUrl = rtrim((string) ($this->option('base-url') ?: config('app.url')), '/');
        $url = "{$baseUrl}/api/webhooks/cora/{$callbackKey}";
        $idempotencyKey = (string) ($this->option('idempotency-key') ?: Str::uuid());

        $this->line("Tenant: {$tenant->id} · ambiente: {$environment} · trigger: invoice/{$trigger}");
        $this->line("Idempotency-Key: {$idempotencyKey}");

        if ($this->option('dry-run')) {
            $this->line('URL (com chave de exemplo): ' . preg_replace('#/cora/.+$#', '/cora/<chave-gerada>', $url));
            $this->warn('Dry-run: nada foi enviado à Cora nem gravado.');

            return self::SUCCESS;
        }

        try {
            $response = $gateway->registerWebhookEndpoint($tenant, $environment, $url, 'invoice', $trigger, $idempotencyKey);
        } catch (Throwable $e) {
            $this->error('Falha ao cadastrar na Cora: ' . $e->getMessage());
            $this->line("Para repetir a mesma operação sem duplicar, use --idempotency-key={$idempotencyKey}");

            return self::FAILURE;
        }

        CoraWebhookEndpoint::create([
            'tenant_id' => $tenant->id,
            'environment' => $environment,
            'callback_key_hash' => CoraWebhookEndpoint::hashKey($callbackKey),
            'cora_endpoint_id' => isset($response['id']) ? (string) $response['id'] : null,
            'resource' => 'invoice',
            'trigger' => $trigger,
            'active' => true,
            'registered_at' => now(),
        ]);

        $this->info('Assinatura cadastrada. ID na Cora: ' . ($response['id'] ?? '—'));

        return self::SUCCESS;
    }
}

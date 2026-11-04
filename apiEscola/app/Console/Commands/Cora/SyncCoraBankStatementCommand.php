<?php

namespace App\Console\Commands\Cora;

use App\Models\Tenant;
use App\Models\TenantCoraCredential;
use App\Services\Cora\CoraBankStatementSyncService;
use App\Support\BusinessDate;
use Illuminate\Console\Command;
use Throwable;

/** Busca o extrato Cora (somente leitura) dos tenants com credencial ativa e tenta a conciliação automática. */
class SyncCoraBankStatementCommand extends Command
{
    protected $signature = 'cora:sync-bank-statement
                            {--tenant= : Filtrar por tenant_id}
                            {--environment=prod : Ambiente Cora (prod ou stage)}
                            {--days= : Só os últimos N dias (máx. 92). Sem isto, busca tudo o que ainda não foi importado}';

    protected $description = 'Traz o extrato da conta Cora para a conciliação bancária';

    public function handle(CoraBankStatementSyncService $sync): int
    {
        $environment = $this->option('environment') === 'stage' ? 'stage' : 'prod';
        $daysOption = $this->option('days');
        $days = $daysOption !== null && $daysOption !== ''
            ? min(max((int) $daysOption, 1), CoraBankStatementSyncService::MAX_PERIOD_DAYS)
            : null;
        $end = BusinessDate::today();
        $start = $days !== null ? $end->copy()->subDays($days - 1) : null;

        $tenantIds = TenantCoraCredential::query()
            ->where('environment', $environment)
            ->where('active', true)
            ->when($this->option('tenant'), fn ($q, $id) => $q->where('tenant_id', (int) $id))
            ->distinct()
            ->pluck('tenant_id');

        $failed = 0;
        foreach (Tenant::query()->whereIn('id', $tenantIds)->get() as $tenant) {
            try {
                $result = $start !== null
                    ? $sync->sync($tenant, $environment, $start, $end)->only(['created', 'auto_reconciled', 'divergent'])
                    : $sync->syncPending($tenant, $environment);
                $this->info("Tenant {$tenant->id}: {$result['created']} nova(s), {$result['auto_reconciled']} conciliada(s), {$result['divergent']} divergente(s).");
            } catch (Throwable $e) {
                $failed++;
                $this->error("Tenant {$tenant->id}: {$e->getMessage()}");
            }
        }

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}

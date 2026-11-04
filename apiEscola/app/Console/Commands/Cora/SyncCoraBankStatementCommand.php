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
                            {--days=3 : Dias para trás a partir de hoje (máx. 92)}';

    protected $description = 'Traz o extrato da conta Cora para a conciliação bancária';

    public function handle(CoraBankStatementSyncService $sync): int
    {
        $environment = $this->option('environment') === 'stage' ? 'stage' : 'prod';
        $days = min(max((int) $this->option('days'), 1), CoraBankStatementSyncService::MAX_PERIOD_DAYS);
        $end = BusinessDate::today();
        $start = $end->copy()->subDays($days - 1);

        $tenantIds = TenantCoraCredential::query()
            ->where('environment', $environment)
            ->where('active', true)
            ->when($this->option('tenant'), fn ($q, $id) => $q->where('tenant_id', (int) $id))
            ->distinct()
            ->pluck('tenant_id');

        $failed = 0;
        foreach (Tenant::query()->whereIn('id', $tenantIds)->get() as $tenant) {
            try {
                $run = $sync->sync($tenant, $environment, $start, $end);
                $this->info("Tenant {$tenant->id}: {$run->created} nova(s), {$run->auto_reconciled} conciliada(s), {$run->divergent} divergente(s).");
            } catch (Throwable $e) {
                $failed++;
                $this->error("Tenant {$tenant->id}: {$e->getMessage()}");
            }
        }

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}

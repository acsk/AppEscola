<?php

namespace App\Services\Saas;

use App\Models\Tenant;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Throwable;

/**
 * Saúde da plataforma para o super admin: API/banco, filas, integrações e incidentes recentes.
 * Só contagens agregadas por período, com cache curto, para não pesar no carregamento.
 */
class SaasMonitoringService
{
    private const CACHE_SECONDS = 60;

    /** @return array<string, mixed> */
    public function overview(): array
    {
        return Cache::remember('saas:monitoring', self::CACHE_SECONDS, fn () => $this->build());
    }

    /** @return array<string, mixed> */
    private function build(): array
    {
        $day = now()->subDay();
        $week = now()->subDays(7);
        $tenantNames = Tenant::query()->pluck('name', 'id');
        $incidents = collect();

        // API e banco
        $dbStart = microtime(true);
        $dbOk = true;
        try {
            DB::select('select 1');
        } catch (Throwable) {
            $dbOk = false;
        }
        $dbMs = round((microtime(true) - $dbStart) * 1000, 1);

        // Filas (driver database)
        $queue = ['driver' => config('queue.default'), 'pending' => null, 'oldest_pending_minutes' => null, 'failed_24h' => 0, 'failed_total' => 0];
        if (Schema::hasTable('jobs')) {
            $queue['pending'] = DB::table('jobs')->count();
            $oldest = DB::table('jobs')->min('created_at');
            $queue['oldest_pending_minutes'] = $oldest ? (int) floor((now()->timestamp - (int) $oldest) / 60) : null;
            $queue['by_queue'] = DB::table('jobs')->select('queue', DB::raw('count(*) as total'))->groupBy('queue')->pluck('total', 'queue');
        }
        if (Schema::hasTable('failed_jobs')) {
            $queue['failed_total'] = DB::table('failed_jobs')->count();
            $queue['failed_24h'] = DB::table('failed_jobs')->where('failed_at', '>=', $day)->count();
            foreach (DB::table('failed_jobs')->where('failed_at', '>=', $week)->latest('failed_at')->limit(10)->get(['uuid', 'queue', 'payload', 'exception', 'failed_at']) as $job) {
                $payload = json_decode((string) $job->payload, true) ?: [];
                $incidents->push([
                    'source' => 'Fila',
                    'title' => class_basename((string) ($payload['displayName'] ?? 'Job')).' falhou',
                    'detail' => $this->firstLine($job->exception),
                    'tenant' => null,
                    'at' => Carbon::parse($job->failed_at)->toISOString(),
                ]);
            }
        }

        // Cora: webhooks e extrato
        $coraWebhooks = $this->countByStatus('cora_webhook_events', 'received_at', $week);
        foreach (DB::table('cora_webhook_events')->where('status', 'failed')->where('received_at', '>=', $week)->latest('received_at')->limit(10)->get(['tenant_id', 'last_error', 'received_at']) as $event) {
            $incidents->push(['source' => 'Cora · webhook', 'title' => 'Aviso de pagamento não processado', 'detail' => $this->firstLine($event->last_error), 'tenant' => $tenantNames[$event->tenant_id] ?? null, 'at' => Carbon::parse($event->received_at)->toISOString()]);
        }
        $coraSyncs = $this->countByStatus('bank_statement_syncs', 'created_at', $week);
        foreach (DB::table('bank_statement_syncs')->where('status', 'failed')->where('created_at', '>=', $week)->latest('id')->limit(10)->get(['tenant_id', 'error', 'created_at']) as $sync) {
            $incidents->push(['source' => 'Cora · extrato', 'title' => 'Sincronização do extrato falhou', 'detail' => $this->firstLine($sync->error), 'tenant' => $tenantNames[$sync->tenant_id] ?? null, 'at' => Carbon::parse($sync->created_at)->toISOString()]);
        }
        $lastSync = DB::table('bank_statement_syncs')->where('status', 'success')->max('finished_at');

        // Asaas: webhooks de pagamento
        $asaas = Schema::hasTable('payment_webhook_events') ? $this->countByStatus('payment_webhook_events', 'created_at', $week) : [];
        if ($asaas) {
            foreach (DB::table('payment_webhook_events')->where('status', 'failed')->where('created_at', '>=', $week)->latest('id')->limit(10)->get(['event_type', 'error_message', 'created_at']) as $event) {
                $incidents->push(['source' => 'Asaas · webhook', 'title' => "Evento {$event->event_type} falhou", 'detail' => $this->firstLine($event->error_message), 'tenant' => null, 'at' => Carbon::parse($event->created_at)->toISOString()]);
            }
        }

        // IA: geração automática de questões
        $ai = $this->countByStatus('question_generation_jobs', 'created_at', $week);
        foreach (DB::table('question_generation_jobs')->where('status', 'failed')->where('created_at', '>=', $week)->latest('id')->limit(10)->get(['tenant_id', 'error', 'created_at']) as $job) {
            $incidents->push(['source' => 'IA', 'title' => 'Geração de questões falhou', 'detail' => $this->firstLine($job->error), 'tenant' => $tenantNames[$job->tenant_id] ?? null, 'at' => Carbon::parse($job->created_at)->toISOString()]);
        }

        $failed = fn (array $counts) => (int) ($counts['failed'] ?? 0);

        return [
            'checked_at' => now()->toISOString(),
            'api' => [
                'status' => $dbOk ? 'ok' : 'down',
                'version' => (string) config('api_meta.version', '1.0.0'),
                'environment' => app()->environment(),
                'php' => PHP_VERSION,
                'database_ms' => $dbOk ? $dbMs : null,
            ],
            'queue' => $queue,
            'integrations' => [
                ['key' => 'cora_webhooks', 'name' => 'Cora · avisos de pagamento', 'counts' => $coraWebhooks, 'failed' => $failed($coraWebhooks), 'last_success_at' => null],
                ['key' => 'cora_statement', 'name' => 'Cora · extrato bancário', 'counts' => $coraSyncs, 'failed' => $failed($coraSyncs), 'last_success_at' => $lastSync ? Carbon::parse($lastSync)->toISOString() : null],
                ['key' => 'asaas_webhooks', 'name' => 'Asaas · avisos de pagamento', 'counts' => $asaas, 'failed' => $failed($asaas), 'last_success_at' => null],
                ['key' => 'ai_generation', 'name' => 'IA · geração de questões', 'counts' => $ai, 'failed' => $failed($ai), 'last_success_at' => null],
            ],
            'incidents' => $incidents->sortByDesc('at')->take(20)->values()->all(),
        ];
    }

    /** @return array<string, int> status → total nos últimos 7 dias */
    private function countByStatus(string $table, string $dateColumn, Carbon $since): array
    {
        return DB::table($table)->where($dateColumn, '>=', $since)
            ->select('status', DB::raw('count(*) as total'))->groupBy('status')
            ->pluck('total', 'status')->map(fn ($v) => (int) $v)->all();
    }

    private function firstLine(?string $text): ?string
    {
        return $text ? Str::limit(trim(strtok($text, "\n")), 240) : null;
    }
}

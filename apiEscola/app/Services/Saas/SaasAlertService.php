<?php

namespace App\Services\Saas;

use App\Models\SaasAlert;
use App\Models\TenantSubscription;
use App\Models\User;
use App\Support\BusinessDate;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * Alertas operacionais: avalia as regras, abre/atualiza um alerta por problema (fingerprint), resolve sozinho
 * o que deixou de acontecer e manda um resumo por e-mail aos administradores globais ativos.
 */
class SaasAlertService
{
    public const SEVERITY_ORDER = ['critical' => 0, 'warning' => 1, 'info' => 2];

    public function __construct(private readonly TenantQuotaService $quotas)
    {
    }

    /** @return array{opened: int, updated: int, resolved: int, notified: int} */
    public function run(): array
    {
        $now = now();
        $found = $this->evaluate()->keyBy('fingerprint');
        $counts = ['opened' => 0, 'updated' => 0, 'resolved' => 0, 'notified' => 0];

        DB::transaction(function () use ($found, $now, &$counts) {
            $existing = SaasAlert::query()->whereIn('fingerprint', $found->keys())->get()->keyBy('fingerprint');
            foreach ($found as $fingerprint => $alert) {
                $row = $existing[$fingerprint] ?? null;
                if ($row && $row->status !== 'resolved') {
                    $row->update(['severity' => $alert['severity'], 'title' => $alert['title'], 'detail' => $alert['detail'], 'last_seen_at' => $now, 'occurrences' => $row->occurrences + 1]);
                    $counts['updated']++;

                    continue;
                }
                $data = $alert + ['status' => 'open', 'occurrences' => 1, 'first_seen_at' => $now, 'last_seen_at' => $now, 'resolved_at' => null, 'acknowledged_by' => null, 'acknowledged_at' => null, 'notified_at' => null];
                $row ? $row->update($data) : SaasAlert::query()->create($data);
                $counts['opened']++;
            }

            $counts['resolved'] = SaasAlert::query()->where('status', '!=', 'resolved')->whereNotIn('fingerprint', $found->keys())
                ->update(['status' => 'resolved', 'resolved_at' => $now]);
        });

        $counts['notified'] = $this->notify();

        return $counts;
    }

    public function acknowledge(SaasAlert $alert, User $user): SaasAlert
    {
        if ($alert->status === 'open') {
            $alert->update(['status' => 'acknowledged', 'acknowledged_by' => $user->id, 'acknowledged_at' => now()]);
        }

        return $alert->fresh();
    }

    /** @return Collection<int, array{fingerprint: string, rule: string, severity: string, tenant_id: int|null, title: string, detail: string|null}> */
    public function evaluate(): Collection
    {
        $t = config('saas.alert_thresholds');
        $alerts = collect();
        $add = function (string $fingerprint, string $rule, string $severity, ?int $tenantId, string $title, ?string $detail = null) use ($alerts) {
            $alerts->push(['fingerprint' => $fingerprint, 'rule' => $rule, 'severity' => $severity, 'tenant_id' => $tenantId, 'title' => mb_substr($title, 0, 160), 'detail' => $detail ? mb_substr($detail, 0, 500) : null]);
        };

        // Filas
        if (Schema::hasTable('failed_jobs')) {
            $failed = DB::table('failed_jobs')->where('failed_at', '>=', now()->subHour())->count();
            if ($failed >= $t['failed_jobs_per_hour']) {
                $add('queue_failures', 'queue_failures', 'critical', null, "{$failed} jobs falharam na última hora", 'Veja os incidentes em Monitoramento › Saúde da plataforma.');
            }
        }
        if (Schema::hasTable('jobs') && ($oldest = DB::table('jobs')->whereNull('reserved_at')->min('available_at'))) {
            $minutes = (int) floor((now()->timestamp - (int) $oldest) / 60);
            if ($minutes >= $t['queue_oldest_pending_minutes']) {
                $add('queue_stuck', 'queue_stuck', 'critical', null, "Fila parada: job esperando há {$minutes} min", 'O worker da fila pode estar parado.');
            }
        }

        // Cora
        foreach (DB::table('cora_webhook_events')->where('status', 'failed')->where('received_at', '>=', now()->subDay())
            ->select('tenant_id', DB::raw('count(*) as total'))->groupBy('tenant_id')->havingRaw('count(*) >= ?', [$t['webhook_failures_per_day']])->get() as $row) {
            $add("cora_webhooks:{$row->tenant_id}", 'cora_webhooks', 'warning', (int) $row->tenant_id, "{$row->total} avisos de pagamento Cora falharam em 24 h", 'Veja os avisos em Financeiro › Integração Cora da instituição.');
        }
        $lastSyncs = DB::table('bank_statement_syncs as s')
            ->whereRaw('s.id = (select max(id) from bank_statement_syncs where tenant_id = s.tenant_id)')
            ->where('s.status', 'failed')->get(['s.tenant_id', 's.error']);
        foreach ($lastSyncs as $row) {
            $add("statement_sync:{$row->tenant_id}", 'statement_sync', 'warning', (int) $row->tenant_id, 'Última sincronização do extrato Cora falhou', $row->error);
        }

        // IA
        $ai = DB::table('ai_usage_logs')->where('created_at', '>=', now()->subDay())
            ->selectRaw("count(*) as total, sum(case when status = 'error' then 1 else 0 end) as errors")->first();
        if ((int) $ai->total >= $t['ai_min_requests_for_error_rate'] && $ai->errors / $ai->total * 100 >= $t['ai_error_rate_percent']) {
            $rate = round($ai->errors / $ai->total * 100, 1);
            $add('ai_error_rate', 'ai_error_rate', 'warning', null, "IA com {$rate}% de erro nas últimas 24 h", "{$ai->errors} de {$ai->total} chamadas falharam.");
        }
        $alertUsd = (float) config('saas.ai_cost_alert_usd', 20);
        foreach (DB::table('ai_usage_logs')->where('created_at', '>=', now()->startOfMonth())->whereNotNull('tenant_id')
            ->selectRaw('tenant_id, sum(coalesce(provider_cost_usd, estimated_cost_usd, 0)) as cost')->groupBy('tenant_id')
            ->havingRaw('sum(coalesce(provider_cost_usd, estimated_cost_usd, 0)) >= ?', [$alertUsd])->get() as $row) {
            $add("ai_cost:{$row->tenant_id}", 'ai_cost', 'warning', (int) $row->tenant_id, sprintf('Custo de IA elevado no mês: US$ %s', number_format((float) $row->cost, 2, ',', '.')), sprintf('Alerta a partir de US$ %s no mês. Detalhes em Monitoramento › Custos de IA.', number_format($alertUsd, 2, ',', '.')));
        }

        // Comercial: atraso e fim de teste
        $today = BusinessDate::today();
        foreach (TenantSubscription::query()->with('plan:id,name')->whereIn('status', [TenantSubscription::PAST_DUE, TenantSubscription::TRIALING])->get() as $s) {
            if ($s->status === TenantSubscription::PAST_DUE) {
                $add("past_due:{$s->tenant_id}", 'past_due', 'warning', $s->tenant_id, 'Assinatura em atraso', 'Vencimento em '.$s->current_period_end?->format('d/m/Y'));
            } elseif ($s->trial_ends_at && $s->trial_ends_at->lte($today->copy()->addDays($t['trial_ending_days']))) {
                $add("trial_ending:{$s->tenant_id}", 'trial_ending', 'info', $s->tenant_id, 'Período de teste termina em breve', 'Teste até '.$s->trial_ends_at->format('d/m/Y').' · plano '.($s->plan?->name ?? '—'));
            }
        }

        // Limites atingidos (só tenants com assinatura ou ajuste de limite)
        $limited = TenantSubscription::query()->pluck('tenant_id')->merge(DB::table('tenant_quota_overrides')->pluck('tenant_id'))->unique();
        foreach ($limited as $tenantId) {
            foreach ($this->quotas->alerts((int) $tenantId) as $row) {
                if ($row['level'] === 'reached') {
                    $add("quota:{$tenantId}:{$row['resource']}", 'quota', 'info', (int) $tenantId, "Limite atingido: {$row['label']}", "{$row['usage']} de {$row['limit']} {$row['unit']}");
                }
            }
        }

        return $alerts;
    }

    /** Resumo por e-mail dos alertas críticos/de atenção ainda não avisados (ou avisados há mais de N horas). */
    private function notify(): int
    {
        if (! config('saas.alert_emails')) {
            return 0;
        }
        $renotify = now()->subHours((int) config('saas.alert_renotify_hours', 24));
        $pending = SaasAlert::query()->with('tenant:id,name')->where('status', 'open')->whereIn('severity', ['critical', 'warning'])
            ->where(fn ($q) => $q->whereNull('notified_at')->orWhere('notified_at', '<', $renotify))
            ->get()->sortBy(fn ($a) => self::SEVERITY_ORDER[$a->severity] ?? 9)->values();
        if ($pending->isEmpty()) {
            return 0;
        }
        $emails = User::query()->where('role', 'super_admin')->where('status', 'active')->pluck('email')->filter()->all();
        if ($emails === []) {
            return 0;
        }

        $lines = $pending->map(fn (SaasAlert $a) => sprintf('[%s] %s%s%s', $a->severity === 'critical' ? 'CRÍTICO' : 'ATENÇÃO', $a->title, $a->tenant ? " — {$a->tenant->name}" : '', $a->detail ? "\n    {$a->detail}" : ''))->implode("\n");
        $body = "Alertas operacionais da plataforma:\n\n{$lines}\n\nVeja e reconheça em ".rtrim((string) config('app.frontend_url', config('app.url')), '/')."/#/plataforma/alertas\n";
        $critical = $pending->where('severity', 'critical')->count();
        $subject = ($critical ? "[Crítico] {$critical} alerta(s)" : "{$pending->count()} alerta(s)").' na plataforma';

        try {
            foreach ($emails as $email) {
                Mail::raw($body, fn ($message) => $message->to($email)->subject($subject));
            }
        } catch (Throwable $e) {
            Log::warning('Alertas SaaS: falha ao enviar e-mail', ['error' => $e->getMessage()]);

            return 0;
        }
        SaasAlert::query()->whereKey($pending->pluck('id'))->update(['notified_at' => now()]);

        return $pending->count();
    }
}

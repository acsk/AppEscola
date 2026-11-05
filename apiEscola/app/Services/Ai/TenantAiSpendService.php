<?php

namespace App\Services\Ai;

use App\Services\Saas\TenantQuotaService;
use App\Support\BusinessDate;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Uso e gasto de IA de um tenant (ai_usage_logs + embedding_usages): mês atual, últimos 6 meses, total,
 * por provedor, por chave (da escola × da plataforma) e por recurso. Custo = real do provedor ou estimado.
 */
class TenantAiSpendService
{
    private const COST = 'coalesce(provider_cost_usd, estimated_cost_usd, 0)';

    private const MONTHS = [1 => 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

    public function __construct(private readonly TenantQuotaService $quotas)
    {
    }

    /** @return array<string, mixed> */
    public function summary(int $tenantId): array
    {
        $monthStart = BusinessDate::today()->startOfMonth();
        $sixMonths = $monthStart->copy()->subMonths(5);
        $logs = fn () => DB::table('ai_usage_logs')->where('tenant_id', $tenantId);
        $aggregate = 'count(*) as requests, sum(case when status = \'error\' then 1 else 0 end) as errors, sum(prompt_tokens + completion_tokens) as tokens, sum('.self::COST.') as cost';

        $month = $logs()->where('created_at', '>=', $monthStart)->selectRaw($aggregate)->first();
        $bySource = $logs()->where('created_at', '>=', $monthStart)->selectRaw('credential_source, sum('.self::COST.') as cost, count(*) as requests')->groupBy('credential_source')->get()->keyBy('credential_source');
        $total = $logs()->selectRaw($aggregate.', min(created_at) as first_at')->first();
        $embeddingsMonth = (float) DB::table('embedding_usages')->where('tenant_id', $tenantId)->where('created_at', '>=', $monthStart)->sum('cost_usd');
        $embeddingsTotal = (float) DB::table('embedding_usages')->where('tenant_id', $tenantId)->sum('cost_usd');

        $monthly = $logs()->where('created_at', '>=', $sixMonths)->get(['created_at', 'provider_cost_usd', 'estimated_cost_usd'])
            ->groupBy(fn ($r) => Carbon::parse($r->created_at)->format('Y-m'));
        $series = [];
        for ($cursor = $sixMonths->copy(); $cursor->lte($monthStart); $cursor->addMonth()) {
            $rows = $monthly[$cursor->format('Y-m')] ?? collect();
            $series[] = [
                'month' => $cursor->format('Y-m'),
                'label' => self::MONTHS[(int) $cursor->month].'/'.$cursor->format('y'),
                'requests' => $rows->count(),
                'cost_usd' => round($rows->sum(fn ($r) => (float) ($r->provider_cost_usd ?? $r->estimated_cost_usd ?? 0)), 4),
            ];
        }

        $limit = $this->quotas->report($tenantId);
        $aiQuota = collect($limit)->firstWhere('resource', 'ai_requests');

        return [
            'month' => [
                'requests' => (int) ($month->requests ?? 0),
                'errors' => (int) ($month->errors ?? 0),
                'tokens' => (int) ($month->tokens ?? 0),
                'cost_usd' => round((float) ($month->cost ?? 0) + $embeddingsMonth, 4),
                'embeddings_cost_usd' => round($embeddingsMonth, 4),
                'tenant_key_cost_usd' => round((float) ($bySource['tenant']->cost ?? 0), 4),
                'platform_key_cost_usd' => round((float) ($bySource['env']->cost ?? 0), 4),
                'platform_key_requests' => (int) ($bySource['env']->requests ?? 0),
                'limit' => $aiQuota['limit'] ?? null,
            ],
            'total' => [
                'requests' => (int) ($total->requests ?? 0),
                'tokens' => (int) ($total->tokens ?? 0),
                'cost_usd' => round((float) ($total->cost ?? 0) + $embeddingsTotal, 4),
                'since' => $total->first_at ? Carbon::parse($total->first_at)->toISOString() : null,
            ],
            'by_provider' => $logs()->where('created_at', '>=', $monthStart)
                ->selectRaw('provider, '.$aggregate.', max(created_at) as last_used_at')->groupBy('provider')->orderByDesc('cost')->get()
                ->map(fn ($r) => [
                    'provider' => $r->provider,
                    'requests' => (int) $r->requests,
                    'errors' => (int) $r->errors,
                    'tokens' => (int) $r->tokens,
                    'cost_usd' => round((float) $r->cost, 4),
                    'last_used_at' => $r->last_used_at ? Carbon::parse($r->last_used_at)->toISOString() : null,
                ])->all(),
            'by_feature' => $logs()->where('created_at', '>=', $monthStart)
                ->selectRaw('feature, count(*) as requests, sum('.self::COST.') as cost')->groupBy('feature')->orderByDesc('cost')->limit(10)->get()
                ->map(fn ($r) => ['feature' => $r->feature, 'requests' => (int) $r->requests, 'cost_usd' => round((float) $r->cost, 4)])->all(),
            'months' => $series,
        ];
    }
}

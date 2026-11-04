<?php

namespace App\Services\Saas;

use App\Models\Tenant;
use App\Support\BusinessDate;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Consumo e custo de IA por período: chamadas de chat/imagem (ai_usage_logs) + embeddings (embedding_usages).
 * Custo = valor informado pelo provedor quando existe; senão, estimativa pela tabela de config/saas.php.
 */
class AiCostReportService
{
    public function __construct(private readonly SaasEntitlementService $entitlements)
    {
    }

    /** @return array<string, mixed> */
    public function build(Carbon $from, Carbon $to, ?int $tenantId = null): array
    {
        $to = $to->copy()->endOfDay();
        $cost = 'coalesce(provider_cost_usd, estimated_cost_usd, 0)';
        $base = fn () => DB::table('ai_usage_logs')->whereBetween('created_at', [$from, $to])->when($tenantId, fn ($q, $v) => $q->where('tenant_id', $v));
        $aggregate = "count(*) as requests, sum(case when status = 'error' then 1 else 0 end) as errors, sum(prompt_tokens) as prompt_tokens, sum(completion_tokens) as completion_tokens, sum({$cost}) as cost, sum(case when provider_cost_usd is null and estimated_cost_usd is null and status = 'success' then 1 else 0 end) as unpriced";

        $totals = (array) $base()->selectRaw($aggregate)->first();
        $embeddings = (array) DB::table('embedding_usages')->whereBetween('created_at', [$from, $to])->when($tenantId, fn ($q, $v) => $q->where('tenant_id', $v))
            ->selectRaw('count(*) as calls, sum(tokens) as tokens, sum(cost_usd) as cost')->first();

        $names = Tenant::withTrashed()->pluck('name', 'id');
        $monthStart = BusinessDate::today()->startOfMonth();
        $monthCost = DB::table('ai_usage_logs')->where('created_at', '>=', $monthStart)->whereNotNull('tenant_id')
            ->selectRaw("tenant_id, count(*) as requests, sum({$cost}) as cost")->groupBy('tenant_id')->get()->keyBy('tenant_id');
        $alertUsd = (float) config('saas.ai_cost_alert_usd', 20);

        $byTenant = $base()->selectRaw("tenant_id, {$aggregate}")->groupBy('tenant_id')->orderByDesc('cost')->get()->map(function ($row) use ($names, $monthCost, $alertUsd) {
            $id = $row->tenant_id;
            $limit = $id ? ($this->entitlements->forTenant((int) $id)['limits']['ai_requests'] ?? null) : null;
            $month = $id ? $monthCost[$id] ?? null : null;

            return $this->row($row) + [
                'tenant' => $id ? ['id' => (int) $id, 'name' => $names[$id] ?? "#{$id}"] : null,
                'month_requests' => (int) ($month->requests ?? 0),
                'month_limit' => $limit,
                'month_cost_usd' => round((float) ($month->cost ?? 0), 4),
                'high_cost' => (float) ($month->cost ?? 0) >= $alertUsd,
            ];
        })->all();

        return [
            'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'alert_threshold_usd' => $alertUsd,
            'totals' => $this->row((object) $totals),
            'embeddings' => ['calls' => (int) ($embeddings['calls'] ?? 0), 'tokens' => (int) ($embeddings['tokens'] ?? 0), 'cost_usd' => round((float) ($embeddings['cost'] ?? 0), 4)],
            'by_tenant' => $byTenant,
            'by_feature' => $base()->selectRaw("feature, {$aggregate}")->groupBy('feature')->orderByDesc('requests')->limit(30)->get()
                ->map(fn ($r) => ['feature' => $r->feature] + $this->row($r))->all(),
            'by_model' => $base()->selectRaw("provider, model, credential_source, {$aggregate}")->groupBy('provider', 'model', 'credential_source')->orderByDesc('cost')->get()
                ->map(fn ($r) => ['provider' => $r->provider, 'model' => $r->model, 'source' => $r->credential_source] + $this->row($r))->all(),
            'daily' => $base()->selectRaw("date(created_at) as day, count(*) as requests, sum({$cost}) as cost")->groupByRaw('date(created_at)')->orderBy('day')->get()
                ->map(fn ($r) => ['day' => (string) $r->day, 'requests' => (int) $r->requests, 'cost_usd' => round((float) $r->cost, 4)])->all(),
            'outputs' => [
                'questions_generated' => DB::table('question_generation_jobs')->whereBetween('created_at', [$from, $to])->where('status', 'done')->when($tenantId, fn ($q, $v) => $q->where('tenant_id', $v))->count(),
                'documents_processed' => DB::table('question_import_drafts')->whereBetween('created_at', [$from, $to])->when($tenantId, fn ($q, $v) => $q->where('tenant_id', $v))->count(),
                'classifications' => $base()->where('feature', 'like', '%classif%')->where('status', 'success')->count(),
            ],
        ];
    }

    /** @return array{requests: int, errors: int, prompt_tokens: int, completion_tokens: int, cost_usd: float, unpriced: int} */
    private function row(object $r): array
    {
        return [
            'requests' => (int) ($r->requests ?? 0),
            'errors' => (int) ($r->errors ?? 0),
            'prompt_tokens' => (int) ($r->prompt_tokens ?? 0),
            'completion_tokens' => (int) ($r->completion_tokens ?? 0),
            'cost_usd' => round((float) ($r->cost ?? 0), 4),
            'unpriced' => (int) ($r->unpriced ?? 0),
        ];
    }
}

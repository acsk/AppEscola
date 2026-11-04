<?php

namespace App\Services\Saas;

use App\Models\SaasFeature;
use App\Models\Tenant;
use App\Models\TenantSubscription;
use App\Models\TenantSubscriptionEvent;
use App\Models\User;
use App\Support\BusinessDate;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/** Relatórios globais do super admin (comercial, operacional, retenção) e consumo por instituição. */
class SaasReportService
{
    public function __construct(private readonly SaasEntitlementService $entitlements)
    {
    }

    /** Consumo × limite de todas as instituições (consultas agrupadas por tenant; cache de 5 min). */
    public function usage(): array
    {
        return Cache::remember('saas:usage', 300, function () {
            $monthStart = BusinessDate::today()->startOfMonth();
            $since30 = now()->subDays(30);
            $count = fn (string $table, ?callable $where = null) => DB::table($table)
                ->when($where, $where)
                ->select('tenant_id', DB::raw('count(*) as total'))->groupBy('tenant_id')->pluck('total', 'tenant_id');

            $usage = [
                'students' => $count('students', fn ($q) => $q->whereNull('deleted_at')->where('status', 'active')),
                'users' => $count('users', fn ($q) => $q->whereNull('deleted_at')->whereNotIn('role', ['aluno', 'responsavel', 'super_admin'])),
                'classes' => $count('school_classes', fn ($q) => $q->whereNull('deleted_at')),
                'questions' => $count('exam_questions'),
                'exams' => $count('exams', fn ($q) => $q->whereNull('deleted_at')),
                'ai_question_generations' => $count('question_generation_jobs', fn ($q) => $q->where('created_at', '>=', $monthStart)),
                'document_processing' => $count('question_import_drafts', fn ($q) => $q->where('created_at', '>=', $monthStart)),
                'ai_requests' => $count('ai_usage_logs', fn ($q) => $q->where('created_at', '>=', $monthStart)),
                'storage_mb' => DB::table('tenant_storage_usages')->pluck('bytes', 'tenant_id')->map(fn ($b) => (int) ceil($b / 1048576)),
            ];
            $answers30 = $count('practice_answers', fn ($q) => $q->where('answered_at', '>=', $since30));
            $lastSeen = DB::table('student_activity_days')->select('tenant_id', DB::raw('max(last_seen_at) as at'))->groupBy('tenant_id')->pluck('at', 'tenant_id');

            return Tenant::query()->with('subscription.plan:id,name')->orderBy('name')->get(['id', 'name', 'status'])->map(function (Tenant $t) use ($usage, $answers30, $lastSeen) {
                $limits = $this->entitlements->forTenant($t->id)['limits'];
                $resources = [];
                $worst = 0.0;
                foreach ($usage as $resource => $totals) {
                    $value = (int) ($totals[$t->id] ?? 0);
                    $limit = $limits[$resource] ?? null;
                    $percent = $limit === null ? null : ($limit === 0 ? 100.0 : round($value / $limit * 100, 1));
                    $worst = max($worst, $percent ?? 0);
                    $resources[$resource] = ['usage' => $value, 'limit' => $limit, 'percent' => $percent];
                }

                return [
                    'tenant' => ['id' => $t->id, 'name' => $t->name, 'status' => $t->status],
                    'plan' => $t->subscription?->plan?->name,
                    'resources' => $resources,
                    'practice_answers_30d' => (int) ($answers30[$t->id] ?? 0),
                    'last_student_activity_at' => isset($lastSeen[$t->id]) ? Carbon::parse($lastSeen[$t->id])->toISOString() : null,
                    'max_percent' => $worst,
                ];
            })->all();
        });
    }

    /** @return array<string, mixed> */
    public function report(string $type, Carbon $from, Carbon $to): array
    {
        $to = $to->copy()->endOfDay();

        return match ($type) {
            'commercial' => $this->commercial($from, $to),
            'operational' => $this->operational($from, $to),
            'retention' => $this->retention($from, $to),
        } + ['period' => ['from' => $from->toDateString(), 'to' => $to->toDateString()]];
    }

    private function commercial(Carbon $from, Carbon $to): array
    {
        $subs = TenantSubscription::query()->with(['plan:id,name', 'tenant:id,name'])->get();
        $events = $this->events($from, $to, ['created', 'canceled', 'plan_changed']);

        return [
            'mrr' => number_format($subs->sum(fn ($s) => $s->monthlyRevenue()), 2, '.', ''),
            'by_plan' => $subs->groupBy('saas_plan_id')->map(fn (Collection $g) => [
                'plan' => $g->first()->plan?->name ?? '—',
                'subscriptions' => $g->count(),
                'paying' => $g->filter(fn ($s) => $s->monthlyRevenue() > 0)->count(),
                'mrr' => number_format($g->sum(fn ($s) => $s->monthlyRevenue()), 2, '.', ''),
            ])->sortByDesc('mrr')->values()->all(),
            'by_tenant' => $subs->filter(fn ($s) => $s->monthlyRevenue() > 0)->sortByDesc(fn ($s) => $s->monthlyRevenue())->map(fn ($s) => [
                'tenant' => $s->tenant?->name, 'plan' => $s->plan?->name, 'cycle' => $s->billing_cycle, 'mrr' => number_format($s->monthlyRevenue(), 2, '.', ''),
            ])->values()->all(),
            'new_subscriptions' => $events->where('type', 'created')->values()->all(),
            'cancellations' => $events->where('type', 'canceled')->values()->all(),
            'plan_changes' => $events->where('type', 'plan_changed')->values()->all(),
            'upgrades' => $events->where('type', 'plan_changed')->where('direction', 'upgrade')->count(),
            'downgrades' => $events->where('type', 'plan_changed')->where('direction', 'downgrade')->count(),
            'overdue' => $subs->where('status', TenantSubscription::PAST_DUE)->map(fn ($s) => [
                'tenant' => $s->tenant?->name, 'plan' => $s->plan?->name, 'due' => $s->current_period_end?->toDateString(), 'amount' => number_format((float) $s->price * (1 - (float) $s->discount_percent / 100), 2, '.', ''),
            ])->values()->all(),
        ];
    }

    private function operational(Carbon $from, Carbon $to): array
    {
        $names = Tenant::query()->pluck('name', 'id');
        $group = fn (string $table, string $column, ?callable $where = null) => DB::table($table)
            ->whereBetween($column, [$from, $to])->when($where, $where)
            ->select('tenant_id', DB::raw('count(*) as total'))->groupBy('tenant_id')->pluck('total', 'tenant_id');

        $answers = $group('practice_answers', 'answered_at');
        $attempts = $group('exam_attempts', 'finished_at', fn ($q) => $q->whereNotNull('finished_at'));
        $newStudents = $group('students', 'created_at', fn ($q) => $q->whereNull('deleted_at'));
        $aiDone = $group('question_generation_jobs', 'created_at', fn ($q) => $q->where('status', 'done'));
        $aiFailed = $group('question_generation_jobs', 'created_at', fn ($q) => $q->where('status', 'failed'));
        $docs = $group('question_import_drafts', 'created_at');
        $webhookFails = $group('cora_webhook_events', 'received_at', fn ($q) => $q->where('status', 'failed'));
        $syncFails = $group('bank_statement_syncs', 'created_at', fn ($q) => $q->where('status', 'failed'));

        $rows = fn (callable $map) => $names->keys()
            ->map(fn ($id) => ['tenant' => $names[$id]] + $map($id))
            ->filter(fn ($row) => collect($row)->except('tenant')->sum() > 0)
            ->sortByDesc(fn ($row) => collect($row)->except('tenant')->sum())->values()->all();

        $features = SaasFeature::query()->orderBy('order')->get(['key', 'name']);
        $enabled = array_fill_keys($features->pluck('key')->all(), 0);
        foreach ($names->keys() as $id) {
            foreach ($this->entitlements->forTenant($id)['features'] as $key => $f) {
                $enabled[$key] = ($enabled[$key] ?? 0) + ($f['enabled'] ? 1 : 0);
            }
        }

        return [
            'most_active' => array_slice($rows(fn ($id) => ['practice_answers' => (int) ($answers[$id] ?? 0), 'exam_attempts' => (int) ($attempts[$id] ?? 0)]), 0, 20),
            'student_growth' => $rows(fn ($id) => ['new_students' => (int) ($newStudents[$id] ?? 0)]),
            'ai_usage' => $rows(fn ($id) => ['generated' => (int) ($aiDone[$id] ?? 0), 'failed' => (int) ($aiFailed[$id] ?? 0), 'documents' => (int) ($docs[$id] ?? 0)]),
            'integration_failures' => $rows(fn ($id) => ['cora_webhooks' => (int) ($webhookFails[$id] ?? 0), 'statement_syncs' => (int) ($syncFails[$id] ?? 0)]),
            'module_adoption' => $features->map(fn ($f) => ['feature' => $f->name, 'tenants' => $enabled[$f->key] ?? 0, 'total' => $names->count()])->all(),
        ];
    }

    private function retention(Carbon $from, Carbon $to): array
    {
        $today = BusinessDate::today();
        $since = now()->subDays(30);
        $activeStudents = DB::table('student_activity_days')->where('last_seen_at', '>=', $since)->distinct()->pluck('tenant_id');
        $activeStaff = DB::table('personal_access_tokens')->join('users', 'users.id', '=', 'personal_access_tokens.tokenable_id')
            ->where('personal_access_tokens.tokenable_type', User::class)->where('personal_access_tokens.last_used_at', '>=', $since)
            ->whereNotNull('users.tenant_id')->distinct()->pluck('users.tenant_id');
        $active = $activeStudents->merge($activeStaff)->unique();
        $subs = TenantSubscription::query()->with(['plan:id,name', 'tenant:id,name'])->get();
        $events = $this->events($from, $to, ['canceled', 'reactivated']);

        return [
            'inactive_tenants' => Tenant::query()->where('status', 'active')->whereNotIn('id', $active)->orderBy('name')->get(['id', 'name', 'created_at'])
                ->map(fn ($t) => ['tenant' => $t->name, 'created_at' => $t->created_at?->toDateString()])->all(),
            'due_soon' => $subs->whereIn('status', [TenantSubscription::ACTIVE, TenantSubscription::PAST_DUE])
                ->filter(fn ($s) => $s->current_period_end && $s->current_period_end->between($today, $today->copy()->addDays(15)))
                ->sortBy('current_period_end')->map(fn ($s) => ['tenant' => $s->tenant?->name, 'plan' => $s->plan?->name, 'due' => $s->current_period_end->toDateString()])->values()->all(),
            'trials' => $subs->where('status', TenantSubscription::TRIALING)->sortBy('trial_ends_at')
                ->map(fn ($s) => ['tenant' => $s->tenant?->name, 'plan' => $s->plan?->name, 'trial_ends_at' => $s->trial_ends_at?->toDateString()])->values()->all(),
            'cancellations_by_reason' => $events->where('type', 'canceled')->groupBy(fn ($e) => mb_strtolower(trim($e['reason'] ?? 'Sem motivo')))
                ->map(fn ($g, $reason) => ['reason' => $g->first()['reason'] ?? 'Sem motivo', 'count' => $g->count()])->sortByDesc('count')->values()->all(),
            'reactivations' => $events->where('type', 'reactivated')->values()->all(),
        ];
    }

    private function events(Carbon $from, Carbon $to, array $types): Collection
    {
        $names = Tenant::withTrashed()->pluck('name', 'id');

        return TenantSubscriptionEvent::query()->with(['fromPlan:id,name', 'toPlan:id,name', 'user:id,name'])
            ->whereIn('type', $types)->whereBetween('created_at', [$from, $to])->latest('id')->get()
            ->map(fn (TenantSubscriptionEvent $e) => [
                'type' => $e->type,
                'tenant' => $names[$e->tenant_id] ?? null,
                'from_plan' => $e->fromPlan?->name,
                'to_plan' => $e->toPlan?->name,
                'direction' => $e->data['direction'] ?? null,
                'reason' => $e->data['reason'] ?? null,
                'user' => $e->user?->name,
                'at' => $e->created_at?->toISOString(),
            ]);
    }
}

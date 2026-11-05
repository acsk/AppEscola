<?php

namespace App\Services\Saas;

use App\Models\Course;
use App\Models\ExamAttempt;
use App\Models\PracticeAnswer;
use App\Models\SchoolClass;
use App\Models\Student;
use App\Models\Tenant;
use App\Models\TenantAiCredential;
use App\Models\TenantAsaasCredential;
use App\Models\TenantCoraCredential;
use App\Models\TenantSubscription;
use App\Models\TenantSubscriptionEvent;
use App\Models\User;
use App\Support\BusinessDate;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Indicadores globais da plataforma (super admin). Só dados operacionais: a receita das mensalidades
 * escolares é do tenant e não entra aqui; receita SaaS depende das assinaturas (fase 2).
 */
class SaasMetricsService
{
    private const CACHE_SECONDS = 300;

    private const MONTHS = [1 => 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

    /** @return array<string, mixed> */
    public function dashboard(int $months, ?string $status): array
    {
        return Cache::remember("saas:dashboard:{$months}:".($status ?? 'all'), self::CACHE_SECONDS, fn () => $this->buildDashboard($months, $status));
    }

    /** @return array<string, mixed> */
    private function buildDashboard(int $months, ?string $status): array
    {
        $today = BusinessDate::today();
        $from = $today->copy()->startOfMonth()->subMonths($months - 1);
        $monthStart = $today->copy()->startOfMonth();

        $tenantIds = $status ? Tenant::query()->where('status', $status)->pluck('id')->all() : null;
        $scope = fn ($query) => $tenantIds === null ? $query : $query->whereIn('tenant_id', $tenantIds);

        $byStatus = Tenant::query()->select('status', DB::raw('count(*) as total'))->groupBy('status')->pluck('total', 'status');
        $tenantDates = Tenant::query()->when($status, fn ($q, $v) => $q->where('status', $v))->pluck('created_at');
        $studentDates = $scope(Student::query())->where('created_at', '>=', $from)->pluck('created_at');
        $studentsBefore = $scope(Student::query())->where('created_at', '<', $from)->count();
        $tenantsBefore = $tenantDates->filter(fn ($d) => $d && $d->lt($from))->count();

        $series = [];
        $cursor = $from->copy();
        while ($cursor->lte($monthStart)) {
            $key = $cursor->format('Y-m');
            $newTenants = $tenantDates->filter(fn ($d) => $d && $d->format('Y-m') === $key)->count();
            $newStudents = $studentDates->filter(fn ($d) => $d->format('Y-m') === $key)->count();
            $tenantsBefore += $newTenants;
            $studentsBefore += $newStudents;
            $series[] = [
                'month' => $key,
                'label' => self::MONTHS[(int) $cursor->month].'/'.$cursor->format('y'),
                'new_tenants' => $newTenants,
                'total_tenants' => $tenantsBefore,
                'new_students' => $newStudents,
                'total_students' => $studentsBefore,
            ];
            $cursor->addMonth();
        }

        return [
            'period' => ['from' => $from->toDateString(), 'to' => $today->toDateString(), 'months' => $months],
            'tenants' => [
                'total' => (int) $byStatus->sum(),
                'active' => (int) ($byStatus['active'] ?? 0),
                'inactive' => (int) ($byStatus['inactive'] ?? 0),
                'suspended' => (int) ($byStatus['suspended'] ?? 0),
                'new_this_month' => Tenant::query()->where('created_at', '>=', $monthStart)->count(),
                'new_last_month' => Tenant::query()->whereBetween('created_at', [$monthStart->copy()->subMonth(), $monthStart])->count(),
            ],
            'by_status' => $byStatus->map(fn ($total, $slug) => ['status' => $slug, 'total' => (int) $total])->values()->all(),
            'students_total' => $scope(Student::query())->count(),
            'users_active' => $scope(User::query())->where('status', 'active')->where('role', '!=', 'super_admin')->count(),
            'practice_answers' => $scope(PracticeAnswer::query())->where('answered_at', '>=', $from)->count(),
            'exam_attempts' => $scope(ExamAttempt::query())->whereNotNull('finished_at')->where('finished_at', '>=', $from)->count(),
            'months' => $series,
            'top_tenants' => $this->topTenants($tenantIds, $from),
            'revenue' => $this->revenue($tenantIds, $from, $today),
        ];
    }

    /**
     * Receita das assinaturas SaaS (nunca das mensalidades escolares). MRR = soma mensal equivalente das ativas e
     * em atraso, com desconto; a série mensal usa o preço atual de cada assinatura (estimativa).
     *
     * @return array<string, mixed>
     */
    private function revenue(?array $tenantIds, Carbon $from, Carbon $today): array
    {
        $subs = TenantSubscription::query()->with('plan:id,name')
            ->when($tenantIds !== null, fn ($q) => $q->whereIn('tenant_id', $tenantIds))
            ->get();
        $paying = $subs->filter(fn (TenantSubscription $s) => $s->monthlyRevenue() > 0 || in_array($s->status, [TenantSubscription::ACTIVE, TenantSubscription::PAST_DUE], true));
        $mrr = round($subs->sum(fn (TenantSubscription $s) => $s->monthlyRevenue()), 2);
        $monthStart = $today->copy()->startOfMonth();
        $canceledThisMonth = TenantSubscriptionEvent::query()->where('type', 'canceled')->where('created_at', '>=', $monthStart)
            ->when($tenantIds !== null, fn ($q) => $q->whereIn('tenant_id', $tenantIds))->distinct()->count('tenant_id');
        $base = $paying->count() + $canceledThisMonth;

        $series = [];
        for ($cursor = $from->copy(); $cursor->lte($monthStart); $cursor->addMonth()) {
            $end = $cursor->copy()->endOfMonth();
            $value = $subs->filter(fn (TenantSubscription $s) => $s->started_at && $s->started_at->lte($end)
                && (! $s->trial_ends_at || $s->trial_ends_at->lte($end))
                && (! $s->canceled_at || $s->canceled_at->gt($end))
                && $s->status !== TenantSubscription::EXPIRED)
                ->sum(function (TenantSubscription $s) {
                    $net = (float) $s->price * (1 - (float) $s->discount_percent / 100);

                    return $s->billing_cycle === 'yearly' ? $net / 12 : $net;
                });
            $series[] = ['month' => $cursor->format('Y-m'), 'label' => self::MONTHS[(int) $cursor->month].'/'.$cursor->format('y'), 'mrr' => round($value, 2)];
        }

        return [
            'mrr' => number_format($mrr, 2, '.', ''),
            'arr' => number_format($mrr * 12, 2, '.', ''),
            'arpa' => number_format($paying->count() ? $mrr / $paying->count() : 0, 2, '.', ''),
            'active_subscriptions' => $paying->count(),
            'trialing' => $subs->where('status', TenantSubscription::TRIALING)->count(),
            'past_due' => $subs->where('status', TenantSubscription::PAST_DUE)->count(),
            'legacy_tenants' => Tenant::query()->when($tenantIds !== null, fn ($q) => $q->whereIn('id', $tenantIds))->doesntHave('subscription')->count(),
            'canceled_this_month' => $canceledThisMonth,
            'churn_rate' => $base ? round($canceledThisMonth / $base * 100, 1) : 0.0,
            'mrr_months' => $series,
            'by_plan' => $subs->groupBy('saas_plan_id')->map(fn ($group) => [
                'plan' => $group->first()->plan?->name ?? '—',
                'tenants' => $group->count(),
                'mrr' => number_format($group->sum(fn (TenantSubscription $s) => $s->monthlyRevenue()), 2, '.', ''),
            ])->values()->all(),
        ];
    }

    /** @return list<array<string, mixed>> */
    private function topTenants(?array $tenantIds, Carbon $from): array
    {
        $answers = PracticeAnswer::query()
            ->where('answered_at', '>=', $from)
            ->when($tenantIds !== null, fn ($q) => $q->whereIn('tenant_id', $tenantIds))
            ->select('tenant_id', DB::raw('count(*) as total'))
            ->groupBy('tenant_id')
            ->pluck('total', 'tenant_id');

        return Tenant::query()
            ->when($tenantIds !== null, fn ($q) => $q->whereIn('id', $tenantIds))
            ->withCount(['students', 'users'])
            ->orderByDesc('students_count')
            ->limit(10)
            ->get(['id', 'name', 'status', 'photo_url'])
            ->map(fn (Tenant $t) => [
                'id' => $t->id,
                'name' => $t->name,
                'status' => $t->status,
                'photo_url' => $t->photo_url,
                'students' => (int) $t->students_count,
                'users' => (int) $t->users_count,
                'practice_answers' => (int) ($answers[$t->id] ?? 0),
            ])
            ->all();
    }

    /** @return array<string, mixed> */
    public function tenantOverview(Tenant $tenant): array
    {
        $since = BusinessDate::today()->subDays(29)->startOfDay();
        $owner = $tenant->users()->where('role', 'admin')->orderByDesc('is_tenant_owner')->orderBy('id')->first(['id', 'name', 'email', 'status']);

        $lastStudentSeen = DB::table('student_activity_days')->where('tenant_id', $tenant->id)->max('last_seen_at');
        $lastTokenUse = DB::table('personal_access_tokens')
            ->where('tokenable_type', User::class)
            ->whereIn('tokenable_id', User::query()->where('tenant_id', $tenant->id)->select('id'))
            ->max('last_used_at');

        return [
            'owner' => $owner?->only(['id', 'name', 'email', 'status']),
            'counts' => [
                'students' => Student::query()->where('tenant_id', $tenant->id)->count(),
                'users' => User::query()->where('tenant_id', $tenant->id)->count(),
                'users_active' => User::query()->where('tenant_id', $tenant->id)->where('status', 'active')->count(),
                'classes' => SchoolClass::query()->where('tenant_id', $tenant->id)->count(),
                'courses' => Course::query()->where('tenant_id', $tenant->id)->count(),
            ],
            'usage_30d' => [
                'from' => $since->toDateString(),
                'practice_answers' => PracticeAnswer::query()->where('tenant_id', $tenant->id)->where('answered_at', '>=', $since)->count(),
                'exam_attempts' => ExamAttempt::query()->where('tenant_id', $tenant->id)->whereNotNull('finished_at')->where('finished_at', '>=', $since)->count(),
                'active_students' => DB::table('student_activity_days')->where('tenant_id', $tenant->id)->where('activity_date', '>=', $since->toDateString())->distinct()->count('student_id'),
            ],
            'last_activity_at' => collect([$lastStudentSeen, $lastTokenUse])->filter()->map(fn ($v) => Carbon::parse($v))->max()?->toISOString(),
            'integrations' => $this->integrations($tenant),
        ];
    }

    /**
     * Situação das integrações sem expor segredos: só se está configurada, ambiente, dica da chave e falhas.
     *
     * @return list<array<string, mixed>>
     */
    private function integrations(Tenant $tenant): array
    {
        $week = now()->subDays(7);
        $cora = TenantCoraCredential::query()->where('tenant_id', $tenant->id)->orderByDesc('active')->latest('id')->first();
        $lastSync = DB::table('bank_statement_syncs')->where('tenant_id', $tenant->id)->latest('id')->first(['status', 'finished_at', 'created_at']);
        $webhookFailures = DB::table('cora_webhook_events')->where('tenant_id', $tenant->id)->where('status', 'failed')->where('received_at', '>=', $week)->count();
        $asaas = TenantAsaasCredential::query()->where('tenant_id', $tenant->id)->latest('id')->first();

        $items = [[
            'key' => 'cora',
            'name' => 'Banco Cora',
            'configured' => (bool) $cora,
            'active' => (bool) $cora?->active,
            'environment' => $cora?->environment,
            'configured_at' => $cora?->configured_at ? Carbon::parse($cora->configured_at)->toISOString() : null,
            'last_sync' => $lastSync ? ['status' => $lastSync->status, 'at' => Carbon::parse($lastSync->finished_at ?? $lastSync->created_at)->toISOString()] : null,
            'recent_failures' => $webhookFailures,
            'hint' => null,
        ], [
            'key' => 'asaas',
            'name' => 'Asaas',
            'configured' => (bool) $asaas,
            'active' => (bool) $asaas?->active,
            'environment' => $asaas?->environment,
            'configured_at' => $asaas?->configured_at ? Carbon::parse($asaas->configured_at)->toISOString() : null,
            'last_sync' => null,
            'recent_failures' => 0,
            'hint' => null,
        ]];

        $email = \App\Models\TenantEmailSetting::query()->where('tenant_id', $tenant->id)->first();
        $emailFailures = DB::table('email_logs')->where('tenant_id', $tenant->id)->where('status', 'failed')->where('created_at', '>=', $week)->count();
        $items[] = [
            'key' => 'email',
            'name' => 'E-mail · '.($email ? ucfirst($email->provider) : 'Resend'),
            'configured' => (bool) $email,
            'active' => (bool) $email?->active,
            'environment' => $email?->from_email,
            'configured_at' => $email?->configured_at?->toISOString(),
            'last_sync' => null,
            'recent_failures' => $emailFailures,
            'hint' => $email?->key_hint ? '…'.$email->key_hint : null,
        ];

        foreach (TenantAiCredential::query()->where('tenant_id', $tenant->id)->orderBy('provider')->get() as $ai) {
            $items[] = [
                'key' => 'ai:'.$ai->provider,
                'name' => 'IA · '.$ai->provider,
                'configured' => true,
                'active' => (bool) $ai->active,
                'environment' => $ai->model,
                'configured_at' => $ai->configured_at ? Carbon::parse($ai->configured_at)->toISOString() : null,
                'last_sync' => null,
                'recent_failures' => 0,
                'hint' => $ai->key_hint,
            ];
        }

        return $items;
    }
}

<?php

namespace App\Services\Saas;

use App\Models\Tenant;
use App\Models\TenantSubscription;
use App\Models\TenantSubscriptionEvent;
use App\Models\User;
use App\Support\BusinessDate;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Indicadores avançados e projeções (receita das assinaturas SaaS) e saúde/retenção das instituições.
 * As movimentações de MRR vêm do mrr_delta gravado em cada evento de assinatura.
 */
class SaasInsightsService
{
    private const MONTHS = [1 => 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

    private const MOVEMENTS = ['new', 'expansion', 'reactivation', 'contraction', 'churn'];

    /** @return array<string, mixed> */
    public function insights(): array
    {
        return Cache::remember('saas:insights', 300, fn () => $this->buildInsights());
    }

    /** @return array<string, mixed> */
    private function buildInsights(): array
    {
        $today = BusinessDate::today();
        $subs = TenantSubscription::query()->get();
        $paying = $subs->filter(fn (TenantSubscription $s) => $s->monthlyRevenue() > 0);
        $mrr = round($paying->sum(fn (TenantSubscription $s) => $s->monthlyRevenue()), 2);
        $arpa = $paying->count() ? round($mrr / $paying->count(), 2) : 0.0;

        // Movimentações de MRR dos últimos 6 meses
        $from = $today->copy()->startOfMonth()->subMonths(5);
        $events = TenantSubscriptionEvent::query()->where('created_at', '>=', $from)->get(['type', 'data', 'created_at', 'tenant_id']);
        $months = [];
        for ($cursor = $from->copy(); $cursor->lte($today); $cursor->addMonth()) {
            $key = $cursor->format('Y-m');
            $row = ['month' => $key, 'label' => self::MONTHS[(int) $cursor->month].'/'.$cursor->format('y')] + array_fill_keys(self::MOVEMENTS, 0.0) + ['net' => 0.0, 'churned_tenants' => 0];
            foreach ($events->filter(fn ($e) => $e->created_at->format('Y-m') === $key) as $e) {
                $movement = $e->data['movement'] ?? null;
                if ($movement) {
                    $row[$movement] += (float) ($e->data['mrr_delta'] ?? 0);
                    $row['net'] += (float) ($e->data['mrr_delta'] ?? 0);
                }
                $row['churned_tenants'] += $e->type === 'canceled' ? 1 : 0;
            }
            $months[] = array_map(fn ($v) => is_float($v) ? round($v, 2) : $v, $row);
        }
        $current = end($months);
        $last3 = array_slice($months, -4, 3) ?: [$current];

        // Churn (últimos 3 meses fechados): clientes e receita, média mensal
        $churnedTenants = array_sum(array_column($last3, 'churned_tenants'));
        $churnedMrr = -array_sum(array_column($last3, 'churn'));
        $customerChurn = $paying->count() + $churnedTenants > 0 ? $churnedTenants / ($paying->count() + $churnedTenants) / count($last3) : 0.0;
        $revenueChurn = $mrr + $churnedMrr > 0 ? $churnedMrr / ($mrr + $churnedMrr) / count($last3) : 0.0;

        // Conversão de teste (testes iniciados nos últimos 180 dias)
        $trialStarts = TenantSubscriptionEvent::query()->where('type', 'created')->where('created_at', '>=', now()->subDays(180))->get(['tenant_id', 'data'])
            ->filter(fn ($e) => (int) ($e->data['trial_days'] ?? 0) > 0)->pluck('tenant_id')->unique();
        $trialSubs = $subs->whereIn('tenant_id', $trialStarts);
        $converted = $trialSubs->filter(fn ($s) => in_array($s->status, [TenantSubscription::ACTIVE, TenantSubscription::PAST_DUE], true))->count();
        $trialEnded = $trialSubs->where('status', '!=', TenantSubscription::TRIALING)->count();

        // Projeção 6 meses: MRR × (1 − churn de receita) + entrada média (novo + expansão + reativação − contração)
        $gross = array_sum(array_map(fn ($m) => $m['new'] + $m['expansion'] + $m['reactivation'] + $m['contraction'], $last3)) / count($last3);
        $projection = [];
        $base = $mrr;
        $optimistic = $mrr;
        for ($i = 1; $i <= 6; $i++) {
            $month = $today->copy()->startOfMonth()->addMonths($i);
            $base = max(0, $base * (1 - $revenueChurn) + $gross);
            $optimistic = max(0, $optimistic + $gross);
            $projection[] = ['month' => $month->format('Y-m'), 'label' => self::MONTHS[(int) $month->month].'/'.$month->format('y'), 'mrr' => round($base, 2), 'mrr_without_churn' => round($optimistic, 2)];
        }

        $renewals = $subs->whereIn('status', [TenantSubscription::ACTIVE, TenantSubscription::PAST_DUE])
            ->filter(fn ($s) => $s->current_period_end && $s->current_period_end->between($today, $today->copy()->addDays(30)));
        $mrrStart = $mrr - $current['net'];

        return [
            'mrr' => $mrr,
            'arpa' => $arpa,
            'paying' => $paying->count(),
            'mrr_growth_percent' => $mrrStart > 0 ? round($current['net'] / $mrrStart * 100, 1) : null,
            'net_new_mrr' => $current['net'],
            'customer_churn_percent' => round($customerChurn * 100, 2),
            'revenue_churn_percent' => round($revenueChurn * 100, 2),
            'ltv' => $customerChurn > 0 ? round($arpa / $customerChurn, 2) : null,
            'trial_conversion' => ['started' => $trialStarts->count(), 'ended' => $trialEnded, 'converted' => $converted, 'percent' => $trialEnded ? round($converted / $trialEnded * 100, 1) : null],
            'renewals_30d' => ['count' => $renewals->count(), 'amount' => round($renewals->sum(fn ($s) => (float) $s->price * (1 - (float) $s->discount_percent / 100)), 2)],
            'movements' => $months,
            'avg_monthly_inflow' => round($gross, 2),
            'projection' => $projection,
        ];
    }

    /**
     * Saúde de cada instituição ativa (0–100) com os motivos. Risco: sem atividade de alunos, queda de uso,
     * equipe sem entrar, assinatura em atraso/cancelada, teste acabando, falhas de integração.
     *
     * @return array<string, mixed>
     */
    public function health(): array
    {
        return Cache::remember('saas:health', 300, function () {
            $now = now();
            $count = fn (string $table, string $column, Carbon $from, ?Carbon $to = null) => DB::table($table)->where($column, '>=', $from)->when($to, fn ($q) => $q->where($column, '<', $to))
                ->select('tenant_id', DB::raw('count(*) as total'))->groupBy('tenant_id')->pluck('total', 'tenant_id');
            $answersRecent = $count('practice_answers', 'answered_at', $now->copy()->subDays(30));
            $answersBefore = $count('practice_answers', 'answered_at', $now->copy()->subDays(60), $now->copy()->subDays(30));
            $activeStudents = DB::table('student_activity_days')->where('activity_date', '>=', $now->copy()->subDays(14)->toDateString())
                ->select('tenant_id', DB::raw('count(distinct student_id) as total'))->groupBy('tenant_id')->pluck('total', 'tenant_id');
            $lastStaff = DB::table('personal_access_tokens')->join('users', 'users.id', '=', 'personal_access_tokens.tokenable_id')
                ->where('personal_access_tokens.tokenable_type', User::class)->whereNotIn('users.role', ['aluno', 'responsavel', 'super_admin'])->whereNotNull('users.tenant_id')
                ->select('users.tenant_id', DB::raw('max(personal_access_tokens.last_used_at) as at'))->groupBy('users.tenant_id')->pluck('at', 'tenant_id');
            $integrationFails = $count('cora_webhook_events', 'received_at', $now->copy()->subDays(7));
            $subs = TenantSubscription::query()->with('plan:id,name')->get()->keyBy('tenant_id');

            $rows = Tenant::query()->where('status', 'active')->orderBy('name')->get(['id', 'name', 'created_at'])->map(function (Tenant $t) use ($answersRecent, $answersBefore, $activeStudents, $lastStaff, $integrationFails, $subs, $now) {
                $score = 100;
                $reasons = [];
                $recent = (int) ($answersRecent[$t->id] ?? 0);
                $before = (int) ($answersBefore[$t->id] ?? 0);
                $students = (int) ($activeStudents[$t->id] ?? 0);
                $staffAt = isset($lastStaff[$t->id]) && $lastStaff[$t->id] ? Carbon::parse($lastStaff[$t->id]) : null;
                $sub = $subs[$t->id] ?? null;

                if ($students === 0) {
                    $score -= 35;
                    $reasons[] = 'Nenhum aluno ativo nos últimos 14 dias';
                }
                if ($before >= 50 && $recent < $before * 0.5) {
                    $score -= 20;
                    $reasons[] = sprintf('Uso caiu %d%% (questões respondidas, 30 dias)', (int) round((1 - $recent / $before) * 100));
                }
                if (! $staffAt || $staffAt->lt($now->copy()->subDays(30))) {
                    $score -= 30;
                    $reasons[] = 'Equipe sem entrar no painel há mais de 30 dias';
                } elseif ($staffAt->lt($now->copy()->subDays(14))) {
                    $score -= 10;
                    $reasons[] = 'Equipe sem entrar no painel há mais de 14 dias';
                }
                if ($sub?->status === TenantSubscription::PAST_DUE) {
                    $score -= 20;
                    $reasons[] = 'Assinatura em atraso';
                } elseif (in_array($sub?->status, [TenantSubscription::CANCELED, TenantSubscription::EXPIRED], true)) {
                    $score -= 35;
                    $reasons[] = $sub->status === TenantSubscription::CANCELED ? 'Assinatura cancelada' : 'Teste expirado sem contratação';
                } elseif ($sub?->status === TenantSubscription::TRIALING && $sub->trial_ends_at?->lte($now->copy()->addDays(7))) {
                    $score -= 10;
                    $reasons[] = 'Teste termina em até 7 dias';
                }
                if ((int) ($integrationFails[$t->id] ?? 0) > 0) {
                    $score -= 5;
                    $reasons[] = 'Falhas recentes na integração Cora';
                }
                $score = max(0, $score);

                return [
                    'tenant' => ['id' => $t->id, 'name' => $t->name],
                    'plan' => $sub?->plan?->name,
                    'subscription_status' => $sub?->status,
                    'score' => $score,
                    'level' => $score >= 70 ? 'healthy' : ($score >= 40 ? 'attention' : 'risk'),
                    'reasons' => $reasons,
                    'active_students_14d' => $students,
                    'practice_answers_30d' => $recent,
                    'practice_answers_prev_30d' => $before,
                    'last_staff_login_at' => $staffAt?->toISOString(),
                ];
            })->sortBy('score')->values();

            return [
                'summary' => ['healthy' => $rows->where('level', 'healthy')->count(), 'attention' => $rows->where('level', 'attention')->count(), 'risk' => $rows->where('level', 'risk')->count()],
                'items' => $rows->all(),
                'cohorts' => $this->cohorts(),
            ];
        });
    }

    /** Retenção por mês de cadastro (últimos 12 meses): quantas seguem ativas e sem assinatura encerrada. */
    private function cohorts(): array
    {
        $from = BusinessDate::today()->startOfMonth()->subMonths(11);
        $closed = TenantSubscription::query()->whereIn('status', [TenantSubscription::CANCELED, TenantSubscription::EXPIRED])->pluck('tenant_id')->flip();

        return Tenant::withTrashed()->where('created_at', '>=', $from)->get(['id', 'status', 'created_at', 'deleted_at'])
            ->groupBy(fn ($t) => $t->created_at->format('Y-m'))
            ->map(function ($group, $month) use ($closed) {
                $retained = $group->filter(fn ($t) => ! $t->deleted_at && $t->status === 'active' && ! isset($closed[$t->id]))->count();
                [$y, $m] = explode('-', $month);

                return ['month' => $month, 'label' => self::MONTHS[(int) $m].'/'.substr($y, 2), 'created' => $group->count(), 'retained' => $retained, 'percent' => round($retained / $group->count() * 100, 1)];
            })->sortKeys()->values()->all();
    }
}

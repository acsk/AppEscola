<?php

namespace App\Services\Saas;

use App\Models\SaasBillingExclusion;
use App\Models\SaasCompetenceClose;
use App\Models\Tenant;
use App\Models\TenantSubscription;
use App\Models\User;
use App\Support\BusinessDate;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

/**
 * Ano do contrato SaaS, mês a mês.
 * Mês fechado usa a foto gravada. Mês aberto soma quem já estava com quem entrou no mês.
 * O custo de IA não entra: as chaves são do cliente.
 */
class SaasCompetenceService
{
    private const MONTHS = [
        1 => 'Janeiro', 2 => 'Fevereiro', 3 => 'Março', 4 => 'Abril', 5 => 'Maio', 6 => 'Junho',
        7 => 'Julho', 8 => 'Agosto', 9 => 'Setembro', 10 => 'Outubro', 11 => 'Novembro', 12 => 'Dezembro',
    ];

    public function __construct(
        private readonly SaasBillingService $billing,
        private readonly SaasAuditService $audit,
    ) {
    }

    /** @return array<string, mixed> */
    public function year(int $year): array
    {
        $today = BusinessDate::today()->startOfDay();
        $closes = SaasCompetenceClose::query()
            ->whereBetween('competence', [sprintf('%d-01-01', $year), sprintf('%d-12-01', $year)])
            ->get()
            ->keyBy(fn (SaasCompetenceClose $close) => $close->tenant_id.'|'.$close->competence->format('Y-m'));

        $testStudents = SaasBillingExclusion::query()
            ->selectRaw('tenant_id, COUNT(*) as total')
            ->groupBy('tenant_id')
            ->pluck('total', 'tenant_id');

        $rows = TenantSubscription::query()->with(['tenant', 'plan'])->get()->map(function (TenantSubscription $subscription) use ($year, $today, $closes, $testStudents) {
            $months = [];
            $totals = ['closed' => 0.0, 'preview' => 0.0, 'forecast' => 0.0];
            $byMonth = $subscription->isPerStudent()
                ? $this->billing->appStudentsByMonth((int) $subscription->tenant_id, $year, $today)
                : null;
            for ($month = 1; $month <= 12; $month++) {
                $start = Carbon::create($year, $month, 1)->startOfDay();
                $close = $closes->get($subscription->tenant_id.'|'.$start->format('Y-m'));
                $stock = $byMonth[$month] ?? null;
                $row = $close
                    ? $this->closedRow($close, $start, $stock)
                    : $this->openRow($subscription, $start, $today, $stock);
                $months[] = $row;
                $totals[$row['status']] += (float) $row['total'];
            }

            return [
                'tenant' => ['id' => $subscription->tenant_id, 'name' => $subscription->tenant?->name],
                'plan' => $subscription->plan?->name,
                'contract_starts_at' => $subscription->contract_starts_at?->toDateString(),
                'contract_ends_at' => $subscription->contract_ends_at?->toDateString(),
                'test_students' => (int) ($testStudents[$subscription->tenant_id] ?? 0),
                'months' => $months,
                'closed_total' => $this->money($totals['closed']),
                'preview_total' => $this->money($totals['preview']),
                'forecast_total' => $this->money($totals['forecast']),
                'year_total' => $this->money($totals['closed'] + $totals['preview'] + $totals['forecast']),
            ];
        })->values();

        $sum = fn (string $key) => round($rows->sum(fn ($row) => (float) $row[$key]), 2);

        return [
            'year' => $year,
            'ai_billed' => false,
            'note' => 'Cada mês soma quem já estava com quem entrou naquele mês. A entrada é a data da primeira matrícula de quem tem acesso ao app. Sem matrícula, vale a data em que o acesso foi criado. Alunos de teste ficam de fora. Mês futuro repete quem já está. Ao fechar, a quantidade daquele mês fica gravada. As chaves de OpenRouter e GPT são do cliente: o uso e o custo de IA não entram nesta cobrança.',
            'rows' => $rows->all(),
            'closed_total' => $this->money($sum('closed_total')),
            'preview_total' => $this->money($sum('preview_total')),
            'forecast_total' => $this->money($sum('forecast_total')),
            'year_total' => $this->money($sum('year_total')),
        ];
    }

    public function close(Tenant $tenant, string $competence, ?User $actor): SaasCompetenceClose
    {
        $start = Carbon::createFromFormat('!Y-m-d', $competence.'-01')->startOfDay();
        $today = BusinessDate::today()->startOfDay();
        if ($start->gt($today)) {
            throw ValidationException::withMessages(['competence' => ['Esse mês ainda não começou.']]);
        }

        $subscription = TenantSubscription::query()->with('plan')->where('tenant_id', $tenant->id)->first();
        if (! $subscription) {
            throw ValidationException::withMessages(['tenant_id' => ['A instituição não tem assinatura.']]);
        }
        if (SaasCompetenceClose::query()->where('tenant_id', $tenant->id)->whereDate('competence', $start->toDateString())->exists()) {
            throw ValidationException::withMessages(['competence' => ['Esse mês já está fechado.']]);
        }

        $stock = $subscription->isPerStudent()
            ? $this->billing->appStudentsByMonth((int) $tenant->id, (int) $start->year, $today)[(int) $start->month]
            : null;
        $amounts = $this->amounts($subscription, $start, $stock['total'] ?? null);
        $close = SaasCompetenceClose::query()->create([
            'tenant_id' => $tenant->id,
            'competence' => $start->toDateString(),
            'app_students' => $amounts['app_students'] ?? 0,
            'unit_price' => $amounts['unit_price'],
            'app_amount' => $amounts['app_amount'],
            'gestao_amount' => $amounts['gestao_amount'],
            'total' => $amounts['total'],
            'closed_at' => now(),
            'user_id' => $actor?->id,
        ]);
        $this->audit->log($actor, $tenant->id, 'billing.competence_closed', 'Competência '.$start->format('m/Y').' fechada em '.$this->money($amounts['total']));

        return $close;
    }

    /**
     * Regrava um fechamento já feito com a soma de quem estava e de quem entrou naquele mês.
     * Usado para corrigir o fechamento que tinha copiado a quantidade de hoje.
     */
    public function refreshStoredClose(SaasCompetenceClose $close): void
    {
        $subscription = TenantSubscription::query()->with('plan')->where('tenant_id', $close->tenant_id)->first();
        if (! $subscription) {
            return;
        }

        $start = Carbon::parse($close->competence->toDateString())->startOfDay();
        $stock = $subscription->isPerStudent()
            ? $this->billing->appStudentsByMonth((int) $close->tenant_id, (int) $start->year, BusinessDate::today())[(int) $start->month]
            : null;
        $amounts = $this->amounts($subscription, $start, $stock['total'] ?? null);
        $close->update([
            'app_students' => $amounts['app_students'] ?? 0,
            'unit_price' => $amounts['unit_price'],
            'app_amount' => $amounts['app_amount'],
            'gestao_amount' => $amounts['gestao_amount'],
            'total' => $amounts['total'],
        ]);
    }

    /** @param  array{total: int, entered: int, already: int, future: bool}|null  $stock
     * @return array<string, mixed>
     */
    private function closedRow(SaasCompetenceClose $close, Carbon $start, ?array $stock): array
    {
        return [
            'competence' => $start->format('Y-m'),
            'label' => self::MONTHS[(int) $start->month],
            'app_students' => (int) $close->app_students,
            'unit_price' => $this->money($close->unit_price),
            'app_amount' => $this->money($close->app_amount),
            'gestao_amount' => $this->money($close->gestao_amount),
            'total' => $this->money($close->total),
            'status' => 'closed',
            'status_label' => 'Fechado',
            'students_basis' => $stock ? 'Foto do fechamento · '.$this->basis($stock) : 'Foto do fechamento',
            'closed_at' => $close->closed_at?->timezone(config('app.business_timezone', 'America/Sao_Paulo'))->format('d/m/Y H:i'),
            'can_close' => false,
        ];
    }

    /** @param  array{total: int, entered: int, already: int, future: bool}|null  $stock
     * @return array<string, mixed>
     */
    private function openRow(TenantSubscription $subscription, Carbon $start, Carbon $today, ?array $stock): array
    {
        $future = $stock['future'] ?? $start->gt($today);
        $amounts = $this->amounts($subscription, $start, $stock['total'] ?? null);

        return [
            'competence' => $start->format('Y-m'),
            'label' => self::MONTHS[(int) $start->month],
            'app_students' => $amounts['app_students'],
            'unit_price' => $this->money($amounts['unit_price']),
            'app_amount' => $this->money($amounts['app_amount']),
            'gestao_amount' => $this->money($amounts['gestao_amount']),
            'total' => $this->money($amounts['total']),
            'status' => $future ? 'forecast' : 'preview',
            'status_label' => $future ? 'Previsão' : 'Prévia',
            'students_basis' => $stock ? $this->basis($stock) : 'Valor fixo do mês',
            'closed_at' => null,
            'can_close' => ! $future,
        ];
    }

    /** @param  array{total: int, entered: int, already: int, future: bool}  $stock */
    private function basis(array $stock): string
    {
        if ($stock['future']) {
            return 'Previsão com quem já está';
        }

        return $stock['entered'].' entraram + '.$stock['already'].' já estavam';
    }

    /** @return array{app_students: int|null, unit_price: float, app_amount: float, gestao_amount: float, total: float} */
    private function amounts(TenantSubscription $subscription, Carbon $month, ?int $students): array
    {
        $charged = in_array($subscription->status, [TenantSubscription::ACTIVE, TenantSubscription::PAST_DUE], true);
        $factor = 1 - (float) $subscription->discount_percent / 100;
        $gestao = $subscription->gestao_enabled ? round((float) $subscription->gestao_price_monthly * $factor, 2) : 0.0;
        if ($subscription->isPerStudent()) {
            $students ??= $this->billing->appStudents((int) $subscription->tenant_id);
            $unit = $subscription->unitPriceOn($month);
            $app = round($students * $unit * $factor, 2);
        } else {
            $students = null;
            $unit = 0.0;
            $net = (float) $subscription->price * $factor;
            $app = round($subscription->billing_cycle === 'yearly' ? $net / 12 : $net, 2);
        }

        return [
            'app_students' => $students,
            'unit_price' => $unit,
            'app_amount' => $app,
            'gestao_amount' => $gestao,
            'total' => $charged ? round($app + $gestao, 2) : 0.0,
        ];
    }

    private function money(mixed $value): string
    {
        return number_format((float) $value, 2, '.', '');
    }
}

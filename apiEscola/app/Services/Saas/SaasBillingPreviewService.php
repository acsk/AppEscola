<?php

namespace App\Services\Saas;

use App\Models\Tenant;
use App\Models\TenantSubscription;
use App\Support\BusinessDate;
use Illuminate\Support\Carbon;

/**
 * Prévia da cobrança SaaS do mês. Não emite fatura e não mistura com a mensalidade dos alunos.
 * O total cobrado segue TenantSubscription::monthlyAmount(); teste, cancelada e sem assinatura ficam em zero.
 */
class SaasBillingPreviewService
{
    private const MONTHS = [
        1 => 'janeiro', 2 => 'fevereiro', 3 => 'março', 4 => 'abril', 5 => 'maio', 6 => 'junho',
        7 => 'julho', 8 => 'agosto', 9 => 'setembro', 10 => 'outubro', 11 => 'novembro', 12 => 'dezembro',
    ];

    public function __construct(private readonly SaasBillingService $billing)
    {
    }

    /** @return array<string, mixed> */
    public function preview(): array
    {
        $today = BusinessDate::today();
        $rows = Tenant::query()->with('subscription.plan')->orderBy('name')->get()->map(fn (Tenant $tenant) => $this->row($tenant))->values();
        $charged = $rows->where('charged', true);
        $forecast = round($charged->sum(fn ($row) => (float) $row['total']), 2);

        return [
            'competence' => ucfirst(self::MONTHS[(int) $today->month]).'/'.$today->year,
            'preview' => true,
            'measured_at' => Carbon::now(config('app.business_timezone', 'America/Sao_Paulo'))->format('d/m/Y H:i'),
            'forecast' => $this->money($forecast),
            'billable_count' => $charged->count(),
            'uncharged_count' => $rows->count() - $charged->count(),
            'average' => $this->money($charged->count() ? $forecast / $charged->count() : 0),
            'note' => 'Prévia calculada agora. Conta aluno ativo com acesso ao app. O painel não é cobrado. A gestão entra só quando está contratada. Fechamento, emissão de fatura e custo para servir ainda não geram cobrança.',
            'rows' => $rows->all(),
        ];
    }

    /** @return array<string, mixed> */
    private function row(Tenant $tenant): array
    {
        $subscription = $tenant->subscription;
        if (! $subscription) {
            return [
                'tenant' => ['id' => $tenant->id, 'name' => $tenant->name],
                'plan' => null,
                'status' => 'legacy',
                'status_label' => 'Sem assinatura',
                'charged' => false,
                'app_students' => null,
                'lines' => [[
                    'label' => 'Sem assinatura',
                    'detail' => 'Nada é cobrado. O uso da instituição continua liberado.',
                    'amount' => '0.00',
                ]],
                'total' => '0.00',
            ];
        }

        $charged = in_array($subscription->status, [TenantSubscription::ACTIVE, TenantSubscription::PAST_DUE], true);
        $lines = $this->lines($subscription);

        return [
            'tenant' => ['id' => $tenant->id, 'name' => $tenant->name],
            'plan' => $subscription->plan?->name,
            'status' => $subscription->status,
            'status_label' => $this->statusLabel($subscription->status),
            'charged' => $charged,
            'app_students' => $subscription->isPerStudent() ? $this->billing->appStudents((int) $tenant->id) : null,
            'lines' => $charged ? $lines : array_merge([[
                'label' => $this->statusLabel($subscription->status),
                'detail' => 'Esta situação não gera cobrança no mês.',
                'amount' => '0.00',
            ]], $lines),
            'total' => $charged ? $this->money($subscription->monthlyAmount()) : '0.00',
        ];
    }

    /** @return array<int, array{label: string, detail: string, amount: string}> */
    private function lines(TenantSubscription $subscription): array
    {
        $lines = [];
        $factor = 1 - (float) $subscription->discount_percent / 100;
        if ($subscription->isPerStudent()) {
            $students = $this->billing->appStudents((int) $subscription->tenant_id);
            $unit = $subscription->unitPriceOn(BusinessDate::today());
            $lines[] = [
                'label' => 'Acesso ao app',
                'detail' => $students.' alunos × R$ '.$this->money($unit),
                'amount' => $this->money($students * $unit),
            ];
            $lines[] = [
                'label' => 'Painel',
                'detail' => 'incluso, sem cobrança',
                'amount' => '0.00',
            ];
        } else {
            $monthly = $subscription->billing_cycle === 'yearly' ? (float) $subscription->price / 12 : (float) $subscription->price;
            $lines[] = [
                'label' => 'Plano',
                'detail' => $subscription->billing_cycle === 'yearly' ? 'valor anual dividido por 12' : 'valor fixo mensal',
                'amount' => $this->money($monthly),
            ];
        }

        if ($subscription->gestao_enabled) {
            $price = (float) $subscription->gestao_price_monthly;
            $lines[] = [
                'label' => 'Módulo gestão',
                'detail' => $price > 0 ? 'valor mensal à parte' : 'contratado grátis',
                'amount' => $this->money($price),
            ];
        } else {
            $lines[] = [
                'label' => 'Módulo gestão',
                'detail' => 'não contratado',
                'amount' => '0.00',
            ];
        }

        if ((float) $subscription->discount_percent > 0) {
            $gross = array_sum(array_map(fn ($line) => (float) $line['amount'], $lines));
            $lines[] = [
                'label' => 'Desconto',
                'detail' => $this->money((float) $subscription->discount_percent).'% sobre o subtotal',
                'amount' => $this->money(-$gross * (1 - $factor)),
            ];
        }

        return $lines;
    }

    private function statusLabel(string $status): string
    {
        return match ($status) {
            TenantSubscription::TRIALING => 'Em teste',
            TenantSubscription::ACTIVE => 'Ativa',
            TenantSubscription::PAST_DUE => 'Em atraso',
            TenantSubscription::CANCELED => 'Cancelada',
            TenantSubscription::EXPIRED => 'Expirada',
            default => $status,
        };
    }

    private function money(float $value): string
    {
        return number_format(round($value, 2), 2, '.', '');
    }
}

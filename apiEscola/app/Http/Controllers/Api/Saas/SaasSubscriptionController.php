<?php

namespace App\Http\Controllers\Api\Saas;

use App\Http\Controllers\Controller;
use App\Models\SaasPlan;
use App\Models\Tenant;
use App\Models\TenantSubscription;
use App\Services\Saas\SaasBillingService;
use App\Services\Saas\SaasSubscriptionService;
use App\Support\BusinessDate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SaasSubscriptionController extends Controller
{
    public function __construct(private readonly SaasSubscriptionService $subscriptions)
    {
    }

    /** Todas as instituições com a assinatura atual (tenant sem assinatura aparece como legado). */
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'status' => ['nullable', 'in:legacy,trialing,active,past_due,canceled,expired'],
            'plan_id' => ['nullable', 'integer'],
            'search' => ['nullable', 'string', 'max:120'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $page = Tenant::query()
            ->with('subscription.plan:id,name,billing_basis')
            ->when($data['search'] ?? null, fn ($q, $v) => $q->where(fn ($s) => $s->where('name', 'like', "%{$v}%")->orWhere('corporate_name', 'like', "%{$v}%")))
            ->when(($data['status'] ?? null) === 'legacy', fn ($q) => $q->doesntHave('subscription'))
            ->when(($data['status'] ?? null) && $data['status'] !== 'legacy', fn ($q) => $q->whereHas('subscription', fn ($s) => $s->where('status', $data['status'])))
            ->when($data['plan_id'] ?? null, fn ($q, $v) => $q->whereHas('subscription', fn ($s) => $s->where('saas_plan_id', $v)))
            ->orderBy('name')
            ->paginate(20, ['id', 'name', 'status']);

        return $this->success([
            'items' => collect($page->items())->map(fn (Tenant $t) => [
                'tenant' => ['id' => $t->id, 'name' => $t->name, 'status' => $t->status],
                'subscription' => $t->subscription ? $this->present($t->subscription) : null,
            ]),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'per_page' => $page->perPage(), 'total' => $page->total()],
        ], 'Assinaturas carregadas com sucesso.');
    }

    public function show(Tenant $tenant): JsonResponse
    {
        $subscription = TenantSubscription::query()->with(['plan', 'events' => fn ($q) => $q->with(['user:id,name', 'fromPlan:id,name', 'toPlan:id,name'])->latest('id')->limit(50)])
            ->where('tenant_id', $tenant->id)->first();

        return $this->success([
            'subscription' => $subscription ? $this->present($subscription) : null,
            'events' => $subscription ? $subscription->events->map(fn ($e) => [
                'id' => $e->id,
                'type' => $e->type,
                'from_plan' => $e->fromPlan?->name,
                'to_plan' => $e->toPlan?->name,
                'data' => $e->data,
                'user' => $e->user?->name,
                'created_at' => $e->created_at?->toISOString(),
            ]) : [],
        ], 'Assinatura carregada com sucesso.');
    }

    public function store(Request $request, Tenant $tenant): JsonResponse
    {
        $data = $request->validate([
            'saas_plan_id' => ['required', 'integer'],
            'billing_cycle' => ['required', 'in:monthly,yearly'],
            'trial_days' => ['nullable', 'integer', 'min:0', 'max:365'],
            'discount_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ]);

        return $this->created($this->present($this->subscriptions->subscribe($tenant, $data, $request->user())), 'Assinatura contratada com sucesso.');
    }

    public function changePlan(Request $request, Tenant $tenant): JsonResponse
    {
        $data = $request->validate(['saas_plan_id' => ['required', 'integer'], 'billing_cycle' => ['required', 'in:monthly,yearly']]);

        return $this->success($this->present($this->subscriptions->changePlan($this->current($tenant), (int) $data['saas_plan_id'], $data['billing_cycle'], $request->user())), 'Plano alterado com sucesso.');
    }

    public function renew(Request $request, Tenant $tenant): JsonResponse
    {
        return $this->success($this->present($this->subscriptions->renew($this->current($tenant), $request->user())), 'Renovação registrada com sucesso.');
    }

    public function cancel(Request $request, Tenant $tenant): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:255']], [], ['reason' => 'motivo']);

        return $this->success($this->present($this->subscriptions->cancel($this->current($tenant), $data['reason'], $request->user())), 'Assinatura cancelada.');
    }

    public function reactivate(Request $request, Tenant $tenant): JsonResponse
    {
        return $this->success($this->present($this->subscriptions->reactivate($this->current($tenant), $request->user())), 'Assinatura reativada com sucesso.');
    }

    public function extendTrial(Request $request, Tenant $tenant): JsonResponse
    {
        $data = $request->validate(['days' => ['required', 'integer', 'min:1', 'max:180']], [], ['days' => 'dias']);

        return $this->success($this->present($this->subscriptions->extendTrial($this->current($tenant), (int) $data['days'], $request->user())), 'Período de teste estendido.');
    }

    public function discount(Request $request, Tenant $tenant): JsonResponse
    {
        $data = $request->validate(['discount_percent' => ['required', 'numeric', 'min:0', 'max:100']], [], ['discount_percent' => 'desconto']);

        return $this->success($this->present($this->subscriptions->setDiscount($this->current($tenant), (float) $data['discount_percent'], $request->user())), 'Desconto atualizado.');
    }

    public function pricing(Request $request, Tenant $tenant): JsonResponse
    {
        $data = $request->validate([
            'gestao_enabled' => ['required', 'boolean'],
            'gestao_price_monthly' => ['required', 'numeric', 'min:0', 'max:9999999'],
            'price' => ['nullable', 'numeric', 'min:0', 'max:9999999'],
            'price_schedule' => ['nullable', 'array', 'max:24'],
            'price_schedule.*.from' => ['required', 'date_format:Y-m-d'],
            'price_schedule.*.until' => ['nullable', 'date_format:Y-m-d'],
            'price_schedule.*.price' => ['required', 'numeric', 'min:0', 'max:9999999'],
        ], [], [
            'gestao_enabled' => 'módulo gestão',
            'gestao_price_monthly' => 'valor da gestão',
            'price' => 'preço de referência',
            'price_schedule' => 'faixa de preço',
        ]);

        return $this->success($this->present($this->subscriptions->updatePricing($this->current($tenant), $data, $request->user())), 'Valores da assinatura atualizados.');
    }

    private function current(Tenant $tenant): TenantSubscription
    {
        $subscription = TenantSubscription::query()->with('plan')->where('tenant_id', $tenant->id)->first();
        abort_if(! $subscription, 404, 'A instituição não tem assinatura.');

        return $subscription;
    }

    private function present(TenantSubscription $s): array
    {
        $perStudent = $s->isPerStudent();
        $amount = $s->monthlyAmount();
        $cycleTotal = $perStudent
            ? ($s->billing_cycle === 'yearly' ? $amount * 12 : $amount)
            : (float) $s->price * (1 - (float) $s->discount_percent / 100);

        return [
            'id' => $s->id,
            'plan' => $s->plan ? ['id' => $s->plan->id, 'name' => $s->plan->name] : null,
            'status' => $s->status,
            'billing_cycle' => $s->billing_cycle,
            'billing_basis' => $perStudent ? SaasPlan::PER_STUDENT : SaasPlan::FLAT,
            'price' => (string) $s->price,
            'unit_price' => $perStudent ? number_format($s->unitPriceOn(BusinessDate::today()), 2, '.', '') : null,
            'app_students' => $perStudent ? app(SaasBillingService::class)->appStudents((int) $s->tenant_id) : null,
            'price_schedule' => $perStudent ? ($s->price_schedule ?? []) : null,
            'gestao_enabled' => (bool) $s->gestao_enabled,
            'gestao_price_monthly' => number_format((float) $s->gestao_price_monthly, 2, '.', ''),
            'painel_included' => true,
            'discount_percent' => (string) $s->discount_percent,
            'net_price' => number_format($cycleTotal, 2, '.', ''),
            'monthly_amount' => number_format($amount, 2, '.', ''),
            'monthly_revenue' => number_format($s->monthlyRevenue(), 2, '.', ''),
            'started_at' => $s->started_at?->toDateString(),
            'trial_ends_at' => $s->trial_ends_at?->toDateString(),
            'current_period_end' => $s->current_period_end?->toDateString(),
            'canceled_at' => $s->canceled_at?->toISOString(),
            'cancel_reason' => $s->cancel_reason,
        ];
    }
}

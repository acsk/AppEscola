<?php

use App\Services\Saas\TenantQuotaService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Contrato anual de 2026 do Conectivo, cobrado mês a mês.
 * O fechamento guarda a quantidade de alunos e o valor daquele mês.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenant_subscriptions', function (Blueprint $table) {
            $table->date('contract_starts_at')->nullable()->after('current_period_end');
            $table->date('contract_ends_at')->nullable()->after('contract_starts_at');
        });

        Schema::create('saas_competence_closes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->date('competence')->comment('Primeiro dia do mês fechado');
            $table->unsignedInteger('app_students')->default(0);
            $table->decimal('unit_price', 10, 2)->default(0);
            $table->decimal('app_amount', 10, 2)->default(0);
            $table->decimal('gestao_amount', 10, 2)->default(0);
            $table->decimal('total', 10, 2)->default(0);
            $table->timestamp('closed_at');
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['tenant_id', 'competence']);
        });

        $schedule = [
            ['from' => '2026-01-01', 'until' => '2026-06-30', 'price' => '15.00'],
            ['from' => '2026-07-01', 'until' => '2026-12-31', 'price' => '20.00'],
        ];
        $previous = [
            ['from' => '2027-01-01', 'until' => '2027-06-30', 'price' => '15.00'],
            ['from' => '2027-07-01', 'until' => null, 'price' => '20.00'],
        ];
        $planId = DB::table('saas_plans')->where('slug', 'conectivo-reforco')->value('id');
        if (! $planId) {
            $features = DB::table('saas_features')->orderBy('order')->pluck('key')->all();
            $planId = DB::table('saas_plans')->insertGetId([
                'name' => 'Conectivo Reforço',
                'slug' => 'conectivo-reforco',
                'description' => 'Contrato anual de 2026, cobrado mês a mês por aluno com acesso ao app. Janeiro a junho: R$ 15. Julho a dezembro: R$ 20. Painel sem cobrança. Gestão grátis. As chaves de IA são do cliente.',
                'price_monthly' => 15,
                'price_yearly' => null,
                'trial_days' => 0,
                'status' => 'active',
                'limits' => json_encode(array_fill_keys(array_keys(TenantQuotaService::RESOURCES), null)),
                'features' => json_encode(array_values($features)),
                'order' => 4,
                'billing_basis' => 'per_student',
                'gestao_price_monthly' => 0,
                'price_schedule' => json_encode($schedule),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } else {
            $plan = DB::table('saas_plans')->where('id', $planId)->first();
            $update = ['updated_at' => now()];
            if ($this->sameSchedule($plan->price_schedule ?? null, $previous) || $plan->price_schedule === null) {
                $update['price_schedule'] = json_encode($schedule);
                $update['description'] = 'Contrato anual de 2026, cobrado mês a mês por aluno com acesso ao app. Janeiro a junho: R$ 15. Julho a dezembro: R$ 20. Painel sem cobrança. Gestão grátis. As chaves de IA são do cliente.';
            }
            DB::table('saas_plans')->where('id', $planId)->update($update);
        }

        foreach (DB::table('tenant_subscriptions')->where('saas_plan_id', $planId)->orderBy('id')->get() as $subscription) {
            $changes = ['updated_at' => now()];
            if ($subscription->contract_starts_at === null) {
                $changes['contract_starts_at'] = '2026-01-01';
                $changes['contract_ends_at'] = '2026-12-31';
            }
            if ($this->sameSchedule($subscription->price_schedule, $previous) || $subscription->price_schedule === null) {
                $changes['price_schedule'] = json_encode($schedule);
            }
            DB::table('tenant_subscriptions')->where('id', $subscription->id)->update($changes);
        }

        $tenants = DB::table('tenants')->whereNull('deleted_at')->where(function ($query) {
            $query->whereRaw('LOWER(name) like ?', ['%conectivo%'])
                ->orWhereRaw('LOWER(COALESCE(trade_name, "")) like ?', ['%conectivo%'])
                ->orWhereRaw('LOWER(COALESCE(corporate_name, "")) like ?', ['%conectivo%'])
                ->orWhereRaw('LOWER(slug) like ?', ['%conectivo%']);
        })->get(['id']);

        foreach ($tenants as $tenant) {
            if (DB::table('tenant_subscriptions')->where('tenant_id', $tenant->id)->exists()) {
                continue;
            }
            $subscriptionId = DB::table('tenant_subscriptions')->insertGetId([
                'tenant_id' => $tenant->id,
                'saas_plan_id' => $planId,
                'status' => 'active',
                'billing_cycle' => 'monthly',
                'price' => 15,
                'discount_percent' => 0,
                'price_schedule' => json_encode($schedule),
                'gestao_enabled' => true,
                'gestao_price_monthly' => 0,
                'started_at' => '2026-01-01',
                'trial_ends_at' => null,
                'current_period_end' => '2026-12-31',
                'contract_starts_at' => '2026-01-01',
                'contract_ends_at' => '2026-12-31',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            DB::table('tenant_subscription_events')->insert([
                'tenant_id' => $tenant->id,
                'tenant_subscription_id' => $subscriptionId,
                'type' => 'created',
                'to_plan_id' => $planId,
                'data' => json_encode([
                    'billing_cycle' => 'monthly',
                    'contract' => '2026',
                    'note' => 'Contrato anual de 2026, cobrado mês a mês. Jan–jun: R$ 15. Jul–dez: R$ 20. IA por conta do cliente.',
                ]),
                'user_id' => null,
                'created_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('saas_competence_closes');
        Schema::table('tenant_subscriptions', function (Blueprint $table) {
            $table->dropColumn(['contract_starts_at', 'contract_ends_at']);
        });
    }

    private function sameSchedule(mixed $stored, array $expected): bool
    {
        $decoded = is_string($stored) ? json_decode($stored, true) : $stored;
        if (! is_array($decoded)) {
            return false;
        }
        $normalize = function (array $rows): array {
            return array_map(function ($row) {
                $until = $row['until'] ?? null;

                return [
                    'from' => substr((string) ($row['from'] ?? ''), 0, 10),
                    'until' => $until === null || $until === '' ? null : substr((string) $until, 0, 10),
                    'price' => number_format((float) ($row['price'] ?? 0), 2, '.', ''),
                ];
            }, array_values($rows));
        };

        return json_encode($normalize($decoded)) === json_encode($expected);
    }
};

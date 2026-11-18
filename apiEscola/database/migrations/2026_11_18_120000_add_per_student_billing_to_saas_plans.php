<?php

use App\Services\Saas\TenantQuotaService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Cobrança por aluno com acesso ao app.
 * O painel não entra no valor. Gestão é opcional: null = não oferecida, 0 = grátis, acima disso = mensalidade à parte.
 * A faixa do Conectivo fica na assinatura e pode ser alterada sem trocar o plano.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('saas_plans', function (Blueprint $table) {
            $table->string('billing_basis', 20)->default('flat')->after('price_yearly')->comment('flat, per_student');
            $table->decimal('gestao_price_monthly', 10, 2)->nullable()->after('billing_basis')->comment('NULL = gestão não oferecida; 0 = grátis');
            $table->json('price_schedule')->nullable()->after('gestao_price_monthly')->comment('Faixas {from, until|null, price} copiadas na contratação');
        });

        Schema::table('tenant_subscriptions', function (Blueprint $table) {
            $table->json('price_schedule')->nullable()->after('price');
            $table->boolean('gestao_enabled')->default(false)->after('price_schedule');
            $table->decimal('gestao_price_monthly', 10, 2)->default(0)->after('gestao_enabled');
        });

        $now = now();
        $schedule = [
            ['from' => '2027-01-01', 'until' => '2027-06-30', 'price' => '15.00'],
            ['from' => '2027-07-01', 'until' => null, 'price' => '20.00'],
        ];
        $features = DB::table('saas_features')->orderBy('order')->pluck('key')->all();
        $limits = array_fill_keys(array_keys(TenantQuotaService::RESOURCES), null);
        $plan = [
            'name' => 'Conectivo Reforço',
            'description' => 'Cobrança por aluno com acesso ao app. O painel entra sem cobrança. O módulo gestão é opcional: pode ficar grátis ou ter um valor mensal à parte. A faixa de preço da assinatura pode ser alterada quando o valor mudar.',
            'price_monthly' => 15,
            'price_yearly' => null,
            'trial_days' => 0,
            'status' => 'active',
            'limits' => json_encode($limits),
            'features' => json_encode(array_values($features)),
            'order' => 4,
            'billing_basis' => 'per_student',
            'gestao_price_monthly' => 0,
            'price_schedule' => json_encode($schedule),
            'updated_at' => $now,
        ];

        $planId = DB::table('saas_plans')->where('slug', 'conectivo-reforco')->value('id');
        if ($planId) {
            DB::table('saas_plans')->where('id', $planId)->update($plan);
        } else {
            $planId = DB::table('saas_plans')->insertGetId($plan + ['slug' => 'conectivo-reforco', 'created_at' => $now]);
        }

        $tenants = DB::table('tenants')->whereNull('deleted_at')->where(function ($query) {
            $query->whereRaw('LOWER(name) like ?', ['%conectivo%'])
                ->orWhereRaw('LOWER(COALESCE(trade_name, "")) like ?', ['%conectivo%'])
                ->orWhereRaw('LOWER(COALESCE(corporate_name, "")) like ?', ['%conectivo%'])
                ->orWhereRaw('LOWER(slug) like ?', ['%conectivo%']);
        })->get(['id']);

        $today = now()->toDateString();
        $periodEnd = now()->addMonth()->toDateString();
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
                'started_at' => $today,
                'trial_ends_at' => null,
                'current_period_end' => $periodEnd,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            DB::table('tenant_subscription_events')->insert([
                'tenant_id' => $tenant->id,
                'tenant_subscription_id' => $subscriptionId,
                'type' => 'created',
                'to_plan_id' => $planId,
                'data' => json_encode([
                    'billing_cycle' => 'monthly',
                    'trial_days' => 0,
                    'mrr_delta' => 0,
                    'movement' => null,
                    'note' => 'Plano flexível por aluno. Jan–jun/2027: R$ 15. A partir de jul/2027: R$ 20. Gestão grátis. Painel sem cobrança.',
                ]),
                'user_id' => null,
                'created_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        $planId = DB::table('saas_plans')->where('slug', 'conectivo-reforco')->value('id');
        if ($planId) {
            DB::table('tenant_subscriptions')->where('saas_plan_id', $planId)->delete();
            DB::table('saas_plans')->where('id', $planId)->delete();
        }

        Schema::table('tenant_subscriptions', function (Blueprint $table) {
            $table->dropColumn(['price_schedule', 'gestao_enabled', 'gestao_price_monthly']);
        });
        Schema::table('saas_plans', function (Blueprint $table) {
            $table->dropColumn(['billing_basis', 'gestao_price_monthly', 'price_schedule']);
        });
    }
};

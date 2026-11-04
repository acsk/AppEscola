<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Super Admin SaaS — fase 2: planos, assinaturas, feature flags, quotas e auditoria global.
 * Tenant sem assinatura continua como "legado": tudo liberado e sem limites (nada muda para quem já usa).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('saas_features', function (Blueprint $table) {
            $table->id();
            $table->string('key', 60)->unique()->comment('Chave usada no código (middleware feature:<key>)');
            $table->string('name', 120);
            $table->string('description', 255)->nullable();
            $table->string('global_status', 12)->default('enabled')->comment('enabled, beta (só tenants liberados), disabled');
            $table->unsignedSmallInteger('order')->default(0);
            $table->timestamps();
        });

        $now = now();
        DB::table('saas_features')->insert(array_map(fn ($f, $i) => [
            'key' => $f[0], 'name' => $f[1], 'description' => $f[2], 'global_status' => 'enabled',
            'order' => $i, 'created_at' => $now, 'updated_at' => $now,
        ], $features = [
            ['academic', 'Gestão acadêmica', 'Alunos, turmas, cursos e matrículas.'],
            ['exams', 'Simulados', 'Criação e aplicação de simulados online.'],
            ['question_bank', 'Banco de questões', 'Cadastro, classificação e listas de questões.'],
            ['ranking', 'Ranking de alunos', 'Ranking de prática no app do aluno.'],
            ['bi', 'BI educacional', 'Inteligência educacional e relatórios pedagógicos.'],
            ['ai', 'Recursos com IA', 'Extração, classificação e geração de questões com IA.'],
            ['ai_insights', 'Insights com IA', 'Textos de análise gerados por IA no BI.'],
            ['finance', 'Gestão financeira', 'Visão financeira, contas a pagar, fluxo de caixa e relatórios.'],
            ['bank_reconciliation', 'Conciliação bancária', 'Extrato Cora e conciliação de pagamentos.'],
            ['communication', 'Comunicação', 'Notificações para alunos e responsáveis.'],
            ['visual_customization', 'Personalização visual', 'Tema do app mobile do tenant.'],
            ['advanced_export', 'Exportação avançada', 'Exportações em PDF e Excel dos relatórios.'],
        ], array_keys($features)));

        Schema::create('saas_plans', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->string('slug', 60)->unique();
            $table->text('description')->nullable();
            $table->decimal('price_monthly', 10, 2)->default(0);
            $table->decimal('price_yearly', 10, 2)->nullable()->comment('NULL = sem ciclo anual');
            $table->unsignedSmallInteger('trial_days')->default(0);
            $table->string('status', 12)->default('active')->comment('active, inactive (não aceita novas contratações)');
            $table->json('limits')->nullable()->comment('{recurso: limite|null}; ausente/null = ilimitado');
            $table->json('features')->nullable()->comment('Chaves de saas_features incluídas');
            $table->unsignedSmallInteger('order')->default(0);
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('tenant_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->unique()->constrained('tenants')->cascadeOnDelete();
            $table->foreignId('saas_plan_id')->constrained('saas_plans')->restrictOnDelete();
            $table->string('status', 12)->comment('trialing, active, past_due, canceled, expired');
            $table->string('billing_cycle', 10)->default('monthly')->comment('monthly, yearly');
            $table->decimal('price', 10, 2)->comment('Valor contratado por ciclo, antes do desconto');
            $table->decimal('discount_percent', 5, 2)->default(0);
            $table->date('started_at');
            $table->date('trial_ends_at')->nullable();
            $table->date('current_period_end')->nullable()->comment('Próximo vencimento');
            $table->timestamp('canceled_at')->nullable();
            $table->string('cancel_reason', 255)->nullable();
            $table->timestamps();

            $table->index(['status', 'current_period_end']);
            $table->index(['status', 'trial_ends_at']);
        });

        Schema::create('tenant_subscription_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignId('tenant_subscription_id')->constrained('tenant_subscriptions')->cascadeOnDelete();
            $table->string('type', 30)->comment('created, plan_changed, renewed, canceled, reactivated, trial_extended, trial_expired, discount_changed');
            $table->foreignId('from_plan_id')->nullable()->constrained('saas_plans')->nullOnDelete();
            $table->foreignId('to_plan_id')->nullable()->constrained('saas_plans')->nullOnDelete();
            $table->json('data')->nullable();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['tenant_id', 'created_at']);
            $table->index(['type', 'created_at']);
        });

        Schema::create('tenant_feature_overrides', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->string('feature_key', 60);
            $table->boolean('enabled');
            $table->string('reason', 255)->nullable();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['tenant_id', 'feature_key']);
        });

        Schema::create('tenant_quota_overrides', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->string('resource', 40);
            $table->unsignedInteger('limit_value')->nullable()->comment('NULL = ilimitado');
            $table->string('reason', 255)->nullable();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['tenant_id', 'resource']);
        });

        Schema::create('saas_audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('tenant_id')->nullable()->constrained('tenants')->cascadeOnDelete();
            $table->string('action', 60);
            $table->string('description', 255);
            $table->json('changes')->nullable();
            $table->string('ip', 45)->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['tenant_id', 'created_at']);
            $table->index(['action', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('saas_audit_logs');
        Schema::dropIfExists('tenant_quota_overrides');
        Schema::dropIfExists('tenant_feature_overrides');
        Schema::dropIfExists('tenant_subscription_events');
        Schema::dropIfExists('tenant_subscriptions');
        Schema::dropIfExists('saas_plans');
        Schema::dropIfExists('saas_features');
    }
};

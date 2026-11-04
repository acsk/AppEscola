<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Acesso de suporte do super admin a um tenant: motivo, duração, sessão e as ações que alteram dados.
 * Regras em App\Services\SupportAccessService.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('support_access_reasons', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120)->unique();
            $table->boolean('requires_details')->default(false)->comment('Pede o detalhe ao escolher (ex.: Outro)');
            $table->unsignedSmallInteger('order')->default(0);
            $table->boolean('active')->default(true)->comment('Inativo some da lista; acessos antigos continuam com ele');
            $table->timestamps();
        });

        $now = now();
        $reasons = [
            'Dúvida ou orientação de uso a pedido da instituição' => false,
            'Configuração inicial da instituição' => false,
            'Ajuste financeiro ou de cobrança a pedido da instituição' => false,
            'Correção de matrícula ou pagamento' => false,
            'Importação ou correção de dados' => false,
            'Ajuste de usuários ou permissões' => false,
            'Investigação de erro reportado' => false,
            'Outro' => true,
        ];
        $order = 0;
        foreach ($reasons as $name => $requiresDetails) {
            $order += 10;
            DB::table('support_access_reasons')->insert([
                'name' => $name,
                'requires_details' => $requiresDetails,
                'order' => $order,
                'active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        Schema::create('support_accesses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignId('user_id')->comment('Super admin que acessou')->constrained('users')->cascadeOnDelete();
            $table->foreignId('reason_id')->constrained('support_access_reasons')->restrictOnDelete();
            $table->string('details', 500)->nullable()->comment('O que será feito (obrigatório quando o motivo exige)');
            $table->unsignedSmallInteger('duration_minutes');
            $table->dateTime('started_at');
            $table->dateTime('expires_at');
            $table->dateTime('ended_at')->nullable()->comment('NULL = válido até expires_at');
            $table->string('ip', 45)->nullable();
            $table->string('user_agent', 255)->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'started_at']);
            $table->index(['user_id', 'started_at']);
        });

        Schema::create('support_access_actions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('support_access_id')->constrained('support_accesses')->cascadeOnDelete();
            $table->string('method', 10);
            $table->string('path', 255);
            $table->unsignedSmallInteger('status');
            $table->timestamp('created_at')->useCurrent();

            $table->index(['support_access_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('support_access_actions');
        Schema::dropIfExists('support_accesses');
        Schema::dropIfExists('support_access_reasons');
    }
};

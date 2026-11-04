<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Painel Financeiro > Integração Cora: registra quem reprocessou um aviso manualmente e quando.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cora_webhook_events', function (Blueprint $table) {
            $table->unsignedSmallInteger('manual_retries')->default(0)->after('anomaly')
                ->comment('Reprocessamentos pedidos pelo painel');
            $table->unsignedBigInteger('last_retried_by')->nullable()->after('manual_retries')
                ->comment('Usuário do último reprocessamento manual (sem FK: histórico sobrevive ao usuário)');
            $table->timestamp('last_retried_at')->nullable()->after('last_retried_by');
        });
    }

    public function down(): void
    {
        Schema::table('cora_webhook_events', function (Blueprint $table) {
            $table->dropColumn(['manual_retries', 'last_retried_by', 'last_retried_at']);
        });
    }
};

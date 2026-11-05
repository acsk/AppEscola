<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Alertas operacionais do super admin: uma linha por problema (fingerprint), reaberta se voltar a acontecer. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('saas_alerts', function (Blueprint $table) {
            $table->id();
            $table->string('fingerprint', 120)->unique()->comment('Regra + alvo, ex.: queue_failures ou quota_reached:12:students');
            $table->string('rule', 40);
            $table->string('severity', 10)->comment('critical, warning, info');
            $table->foreignId('tenant_id')->nullable()->constrained('tenants')->cascadeOnDelete();
            $table->string('title', 160);
            $table->string('detail', 500)->nullable();
            $table->string('status', 12)->default('open')->comment('open, acknowledged, resolved');
            $table->unsignedInteger('occurrences')->default(1);
            $table->timestamp('first_seen_at');
            $table->timestamp('last_seen_at');
            $table->timestamp('resolved_at')->nullable();
            $table->foreignId('acknowledged_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('acknowledged_at')->nullable();
            $table->timestamp('notified_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'severity']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('saas_alerts');
    }
};

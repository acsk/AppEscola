<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fechamento diário da posição no desempenho e na dedicação.
 * O cabeçalho só é gravado depois das posições, na mesma transação: um dia sem cabeçalho não entra na seta.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('practice_ranking_snapshot_days', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('criterion', 20);
            $table->string('period', 20);
            $table->string('scope_key', 40);
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->unsignedBigInteger('topic_id')->nullable();
            $table->date('reference_on');
            $table->timestamp('captured_at');
            $table->unsignedInteger('participants');
            $table->unique(
                ['tenant_id', 'criterion', 'period', 'scope_key', 'reference_on'],
                'ranking_snapshot_day_unique',
            );
            $table->index('reference_on', 'ranking_snapshot_day_reference_idx');
        });

        Schema::create('practice_ranking_snapshot_positions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('snapshot_day_id')->constrained('practice_ranking_snapshot_days')->cascadeOnDelete();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('position');
            $table->decimal('score', 10, 1);
            $table->unique(['snapshot_day_id', 'student_id'], 'ranking_snapshot_position_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('practice_ranking_snapshot_positions');
        Schema::dropIfExists('practice_ranking_snapshot_days');
    }
};

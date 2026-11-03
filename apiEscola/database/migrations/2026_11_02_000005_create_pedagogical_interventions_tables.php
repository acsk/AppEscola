<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Acompanhamento pedagógico (BI, Fase 3): intervenções individuais ou em grupo, alunos com "antes" e
 * "depois" medidos pelos dados, e a linha do tempo (inclui descarte de sugestões).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pedagogical_interventions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('kind', 12); // individual | group
            $table->string('type', 30);
            $table->string('title', 150);
            $table->string('reason_code', 30);
            $table->string('reason_detail', 255)->nullable();
            $table->foreignId('subject_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('subject_topic_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('school_class_id')->nullable()->constrained()->nullOnDelete();
            $table->string('status', 20)->default('planned');
            $table->foreignId('responsible_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->date('starts_on');
            $table->date('reassess_on')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'status'], 'ped_int_status_idx');
            $table->index(['tenant_id', 'responsible_user_id'], 'ped_int_responsible_idx');
        });

        Schema::create('pedagogical_intervention_students', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('intervention_id')->constrained('pedagogical_interventions')->cascadeOnDelete();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->decimal('baseline_pct', 5, 2)->nullable();
            $table->unsignedInteger('baseline_n')->default(0);
            $table->decimal('result_pct', 5, 2)->nullable();
            $table->unsignedInteger('result_n')->default(0);
            $table->timestamps();

            $table->unique(['intervention_id', 'student_id'], 'ped_int_students_unique');
            $table->index(['tenant_id', 'student_id'], 'ped_int_students_tenant_student_idx');
        });

        Schema::create('pedagogical_intervention_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('intervention_id')->nullable()->constrained('pedagogical_interventions')->cascadeOnDelete();
            // Descarte de sugestão não tem intervenção: guarda o aluno.
            $table->foreignId('student_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('type', 30);
            $table->text('description')->nullable();
            $table->json('data')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('occurred_at');
            $table->timestamps();

            $table->index(['tenant_id', 'type', 'student_id'], 'ped_int_events_type_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pedagogical_intervention_events');
        Schema::dropIfExists('pedagogical_intervention_students');
        Schema::dropIfExists('pedagogical_interventions');
    }
};

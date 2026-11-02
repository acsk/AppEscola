<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Dias de uso do app pelo aluno (base de engajamento do BI). Uma linha por aluno por dia (fuso da escola);
 * `touches` conta blocos de uso de 15 minutos, não requisições.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('student_activity_days', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->date('activity_date');
            $table->timestamp('first_seen_at');
            $table->timestamp('last_seen_at');
            $table->unsignedInteger('touches')->default(1);
            $table->timestamps();

            $table->unique(['student_id', 'activity_date']);
            $table->index(['tenant_id', 'activity_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('student_activity_days');
    }
};

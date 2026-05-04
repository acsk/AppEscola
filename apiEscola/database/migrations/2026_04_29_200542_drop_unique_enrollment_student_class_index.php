<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('enrollments', function (Blueprint $table) {
            // Cria índice simples em student_id antes de remover o único,
            // pois o MySQL exige que a coluna de FK tenha algum índice.
            $table->index('student_id', 'enrollments_student_id_index');
            $table->dropUnique('uq_enrollment_student_class');
        });
    }

    public function down(): void
    {
        Schema::table('enrollments', function (Blueprint $table) {
            $table->unique(['student_id', 'school_class_id'], 'uq_enrollment_student_class');
            $table->dropIndex('enrollments_student_id_index');
        });
    }
};

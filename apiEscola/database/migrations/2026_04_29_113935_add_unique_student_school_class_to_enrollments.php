<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Remove duplicatas antes de criar o índice único
        // Mantém apenas a matrícula mais antiga (menor id) por combinação student+turma
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'mysql') {
            DB::statement('
                DELETE e1 FROM enrollments e1
                INNER JOIN enrollments e2
                WHERE e1.student_id = e2.student_id
                  AND e1.school_class_id = e2.school_class_id
                  AND e1.id > e2.id
            ');
        } else {
            // SQLite / PostgreSQL (testes em :memory:)
            DB::statement('
                DELETE FROM enrollments
                WHERE id IN (
                    SELECT e1.id FROM enrollments AS e1
                    INNER JOIN enrollments AS e2
                    ON e1.student_id = e2.student_id
                       AND e1.school_class_id = e2.school_class_id
                       AND e1.id > e2.id
                )
            ');
        }

        Schema::table('enrollments', function (Blueprint $table) {
            $table->unique(['student_id', 'school_class_id'], 'uq_enrollment_student_class');
        });
    }

    public function down(): void
    {
        Schema::table('enrollments', function (Blueprint $table) {
            $table->dropUnique('uq_enrollment_student_class');
        });
    }
};

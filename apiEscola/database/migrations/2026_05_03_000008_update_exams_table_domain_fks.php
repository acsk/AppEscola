<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Adiciona as novas colunas FK (nullable para permitir migração de dados existentes)
        Schema::table('exams', function (Blueprint $table) {
            $table->unsignedBigInteger('exam_status_id')->nullable()->after('subject_id');
            $table->unsignedBigInteger('exam_type_id')->nullable()->after('exam_status_id');
            $table->foreign('exam_status_id')->references('id')->on('exam_statuses')->restrictOnDelete();
            $table->foreign('exam_type_id')->references('id')->on('exam_types')->restrictOnDelete();
        });

        // 2. Migra dados existentes (slug → id)
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'mysql') {
            DB::statement('
                UPDATE exams e
                JOIN exam_statuses es ON es.slug = e.status
                SET e.exam_status_id = es.id
                WHERE e.exam_status_id IS NULL
            ');
            DB::statement('
                UPDATE exams e
                JOIN exam_types et ON et.slug = e.exam_type
                SET e.exam_type_id = et.id
                WHERE e.exam_type_id IS NULL
            ');
        } else {
            DB::statement('
                UPDATE exams
                SET exam_status_id = (
                    SELECT id FROM exam_statuses WHERE slug = exams.status
                )
                WHERE exam_status_id IS NULL AND status IS NOT NULL
            ');
            DB::statement('
                UPDATE exams
                SET exam_type_id = (
                    SELECT id FROM exam_types WHERE slug = exams.exam_type
                )
                WHERE exam_type_id IS NULL AND exam_type IS NOT NULL
            ');
        }

        // 3. Garante que linhas sem status/type reconhecido recebam os defaults
        DB::statement("
            UPDATE exams
            SET exam_status_id = (SELECT id FROM exam_statuses WHERE slug = 'draft')
            WHERE exam_status_id IS NULL
        ");

        DB::statement("
            UPDATE exams
            SET exam_type_id = (SELECT id FROM exam_types WHERE slug = 'custom')
            WHERE exam_type_id IS NULL
        ");

        // 4. Remove as colunas string antigas
        Schema::table('exams', function (Blueprint $table) {
            $table->dropColumn(['status', 'exam_type']);
        });
    }

    public function down(): void
    {
        // 1. Adiciona de volta as colunas string
        Schema::table('exams', function (Blueprint $table) {
            $table->string('status')->default('draft');
            $table->string('exam_type')->default('custom');
        });

        // 2. Migra dados de volta (id → slug)
        if (Schema::getConnection()->getDriverName() === 'mysql') {
            DB::statement('
                UPDATE exams e
                JOIN exam_statuses es ON es.id = e.exam_status_id
                SET e.status = es.slug
            ');
            DB::statement('
                UPDATE exams e
                JOIN exam_types et ON et.id = e.exam_type_id
                SET e.exam_type = et.slug
            ');
        } else {
            DB::statement('
                UPDATE exams
                SET status = (
                    SELECT slug FROM exam_statuses WHERE id = exams.exam_status_id
                )
                WHERE exam_status_id IS NOT NULL
            ');
            DB::statement('
                UPDATE exams
                SET exam_type = (
                    SELECT slug FROM exam_types WHERE id = exams.exam_type_id
                )
                WHERE exam_type_id IS NOT NULL
            ');
        }

        // 3. Remove as FK columns
        Schema::table('exams', function (Blueprint $table) {
            $table->dropForeign(['exam_status_id']);
            $table->dropForeign(['exam_type_id']);
            $table->dropColumn(['exam_status_id', 'exam_type_id']);
        });
    }
};

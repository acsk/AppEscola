<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('past_exams', 'exam_type_id')) {
            Schema::table('past_exams', function (Blueprint $table) {
                $table->foreignId('exam_type_id')
                    ->nullable()
                    ->after('exam_type')
                    ->constrained('exam_types')
                    ->restrictOnDelete();
            });
        }

        if (Schema::hasColumn('past_exams', 'exam_type')) {
            DB::statement('
                UPDATE past_exams pe
                INNER JOIN exam_types et ON et.slug = pe.exam_type
                SET pe.exam_type_id = et.id
                WHERE pe.exam_type IS NOT NULL AND pe.exam_type_id IS NULL
            ');
        }

        $customTypeId = DB::table('exam_types')->where('slug', 'custom')->value('id');
        if ($customTypeId) {
            DB::table('past_exams')
                ->whereNull('exam_type_id')
                ->update([
                    'exam_type_id' => $customTypeId,
                    'exam_type'    => 'custom',
                ]);
        }

        if (! Schema::hasColumn('exam_questions', 'exam_type_id')) {
            Schema::table('exam_questions', function (Blueprint $table) {
                $table->foreignId('exam_type_id')
                    ->nullable()
                    ->after('subject_id')
                    ->constrained('exam_types')
                    ->restrictOnDelete();
            });
        }

        DB::statement('
            UPDATE exam_questions eq
            INNER JOIN exams e ON e.id = eq.exam_id
            SET eq.exam_type_id = e.exam_type_id
            WHERE eq.exam_type_id IS NULL AND e.exam_type_id IS NOT NULL
        ');

        if ($customTypeId) {
            DB::table('exam_questions')
                ->whereNull('exam_type_id')
                ->update(['exam_type_id' => $customTypeId]);
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('exam_questions', 'exam_type_id')) {
            Schema::table('exam_questions', function (Blueprint $table) {
                $table->dropConstrainedForeignId('exam_type_id');
            });
        }

        if (Schema::hasColumn('past_exams', 'exam_type_id')) {
            Schema::table('past_exams', function (Blueprint $table) {
                $table->dropConstrainedForeignId('exam_type_id');
            });
        }
    }
};

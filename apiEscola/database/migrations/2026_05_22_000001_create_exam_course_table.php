<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('exam_course', function (Blueprint $table) {
            $table->id();
            $table->foreignId('exam_id')->constrained('exams')->cascadeOnDelete();
            $table->foreignId('course_id')->constrained('courses')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['exam_id', 'course_id']);
        });

        DB::table('exam_course')->insertUsing(
            ['exam_id', 'course_id', 'created_at', 'updated_at'],
            DB::table('exams')
                ->whereNotNull('course_id')
                ->select([
                    'id as exam_id',
                    'course_id',
                    DB::raw('CURRENT_TIMESTAMP as created_at'),
                    DB::raw('CURRENT_TIMESTAMP as updated_at'),
                ])
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('exam_course');
    }
};

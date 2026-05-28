<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('past_exam_course', function (Blueprint $table) {
            $table->id();
            $table->foreignId('past_exam_id')->constrained('past_exams')->cascadeOnDelete();
            $table->foreignId('course_id')->constrained('courses')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['past_exam_id', 'course_id']);
        });

        DB::table('past_exam_course')->insertUsing(
            ['past_exam_id', 'course_id', 'created_at', 'updated_at'],
            DB::table('past_exams')
                ->whereNotNull('course_id')
                ->select([
                    'id as past_exam_id',
                    'course_id',
                    DB::raw('CURRENT_TIMESTAMP as created_at'),
                    DB::raw('CURRENT_TIMESTAMP as updated_at'),
                ])
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('past_exam_course');
    }
};

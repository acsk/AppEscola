<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('enrollments', function (Blueprint $table) {
            $table->foreignId('course_plan_id')
                ->nullable()
                ->after('school_class_id')
                ->constrained('course_plans')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('enrollments', function (Blueprint $table) {
            $table->dropForeign(['course_plan_id']);
            $table->dropColumn('course_plan_id');
        });
    }
};

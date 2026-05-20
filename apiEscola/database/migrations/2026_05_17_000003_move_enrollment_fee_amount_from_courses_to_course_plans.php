<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('course_plans', function (Blueprint $table) {
            $table->decimal('enrollment_fee_amount', 10, 2)->nullable()->after('price');
        });

        if (Schema::getConnection()->getDriverName() === 'mysql') {
            DB::statement('UPDATE course_plans cp INNER JOIN courses c ON c.id = cp.course_id SET cp.enrollment_fee_amount = c.enrollment_fee_amount WHERE c.enrollment_fee_amount IS NOT NULL');
        } else {
            DB::statement('
                UPDATE course_plans
                SET enrollment_fee_amount = (
                    SELECT enrollment_fee_amount FROM courses WHERE courses.id = course_plans.course_id
                )
                WHERE EXISTS (
                    SELECT 1 FROM courses
                    WHERE courses.id = course_plans.course_id
                      AND courses.enrollment_fee_amount IS NOT NULL
                )
            ');
        }

        Schema::table('courses', function (Blueprint $table) {
            $table->dropColumn('enrollment_fee_amount');
        });
    }

    public function down(): void
    {
        Schema::table('courses', function (Blueprint $table) {
            $table->decimal('enrollment_fee_amount', 10, 2)->nullable()->after('description');
        });

        if (Schema::getConnection()->getDriverName() === 'mysql') {
            DB::statement('UPDATE courses c INNER JOIN course_plans cp ON cp.course_id = c.id SET c.enrollment_fee_amount = cp.enrollment_fee_amount WHERE cp.enrollment_fee_amount IS NOT NULL');
        } else {
            DB::statement('
                UPDATE courses
                SET enrollment_fee_amount = (
                    SELECT enrollment_fee_amount FROM course_plans WHERE course_plans.course_id = courses.id
                )
                WHERE EXISTS (
                    SELECT 1 FROM course_plans
                    WHERE course_plans.course_id = courses.id
                      AND course_plans.enrollment_fee_amount IS NOT NULL
                )
            ');
        }

        Schema::table('course_plans', function (Blueprint $table) {
            $table->dropColumn('enrollment_fee_amount');
        });
    }
};
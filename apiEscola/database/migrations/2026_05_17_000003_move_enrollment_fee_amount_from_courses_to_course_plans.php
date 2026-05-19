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

        DB::statement('UPDATE course_plans cp INNER JOIN courses c ON c.id = cp.course_id SET cp.enrollment_fee_amount = c.enrollment_fee_amount WHERE c.enrollment_fee_amount IS NOT NULL');

        Schema::table('courses', function (Blueprint $table) {
            $table->dropColumn('enrollment_fee_amount');
        });
    }

    public function down(): void
    {
        Schema::table('courses', function (Blueprint $table) {
            $table->decimal('enrollment_fee_amount', 10, 2)->nullable()->after('description');
        });

        DB::statement('UPDATE courses c INNER JOIN course_plans cp ON cp.course_id = c.id SET c.enrollment_fee_amount = cp.enrollment_fee_amount WHERE cp.enrollment_fee_amount IS NOT NULL');

        Schema::table('course_plans', function (Blueprint $table) {
            $table->dropColumn('enrollment_fee_amount');
        });
    }
};
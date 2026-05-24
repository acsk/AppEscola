<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('past_exams', function (Blueprint $table) {
            if (! Schema::hasColumn('past_exams', 'exam_date')) {
                $table->date('exam_date')->nullable()->after('exam_year');
            }
        });
    }

    public function down(): void
    {
        Schema::table('past_exams', function (Blueprint $table) {
            if (Schema::hasColumn('past_exams', 'exam_date')) {
                $table->dropColumn('exam_date');
            }
        });
    }
};

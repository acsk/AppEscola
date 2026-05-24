<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('past_exams', function (Blueprint $table) {
            $table->index(
                ['tenant_id', 'is_published', 'sort_order', 'exam_date'],
                'past_exams_tenant_published_sort_exam_date_idx'
            );

            $table->index(
                ['tenant_id', 'exam_year'],
                'past_exams_tenant_exam_year_idx'
            );
        });
    }

    public function down(): void
    {
        Schema::table('past_exams', function (Blueprint $table) {
            $table->dropIndex('past_exams_tenant_published_sort_exam_date_idx');
            $table->dropIndex('past_exams_tenant_exam_year_idx');
        });
    }
};

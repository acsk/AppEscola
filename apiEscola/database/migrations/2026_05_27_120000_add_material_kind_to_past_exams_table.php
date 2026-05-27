<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('past_exams', function (Blueprint $table) {
            $table->enum('material_kind', ['prova', 'exercicio'])
                ->default('prova')
                ->after('exam_type');
            $table->index(['tenant_id', 'material_kind', 'is_published']);
        });
    }

    public function down(): void
    {
        Schema::table('past_exams', function (Blueprint $table) {
            $table->dropIndex(['tenant_id', 'material_kind', 'is_published']);
            $table->dropColumn('material_kind');
        });
    }
};

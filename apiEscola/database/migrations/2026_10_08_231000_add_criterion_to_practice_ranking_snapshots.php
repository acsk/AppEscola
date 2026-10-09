<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Separa a foto da seta por tipo de ranking (participação, desempenho, dedicação). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('practice_ranking_snapshots', function (Blueprint $table) {
            $table->string('criterion', 20)->default('participation')->after('period');
            $table->index(['tenant_id', 'period', 'criterion', 'captured_at'], 'ranking_snapshots_lookup_idx');
        });
    }

    public function down(): void
    {
        Schema::table('practice_ranking_snapshots', function (Blueprint $table) {
            $table->dropIndex('ranking_snapshots_lookup_idx');
            $table->dropColumn('criterion');
        });
    }
};

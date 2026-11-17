<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Assuntos desativados saem da taxonomia e podem ser restaurados. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subject_topics', function (Blueprint $table) {
            $table->string('status', 20)->default('active')->after('description');
            $table->index(['tenant_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('subject_topics', function (Blueprint $table) {
            $table->dropIndex(['tenant_id', 'status']);
            $table->dropColumn('status');
        });
    }
};

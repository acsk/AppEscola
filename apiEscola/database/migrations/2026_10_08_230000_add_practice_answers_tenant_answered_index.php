<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Apoia o ranking do banco, que filtra as respostas da escola por período. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('practice_answers', function (Blueprint $table) {
            $table->index(['tenant_id', 'answered_at'], 'practice_answers_tenant_answered_idx');
        });
    }

    public function down(): void
    {
        Schema::table('practice_answers', function (Blueprint $table) {
            $table->dropIndex('practice_answers_tenant_answered_idx');
        });
    }
};

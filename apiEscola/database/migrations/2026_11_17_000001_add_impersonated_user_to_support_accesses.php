<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Acesso de suporte ao app do aluno: a sessão continua do super admin, e o token é emitido na conta do aluno.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('support_accesses', function (Blueprint $table) {
            $table->foreignId('impersonated_user_id')
                ->nullable()
                ->after('user_id')
                ->comment('Usuário do aluno no app; NULL = acesso ao painel do tenant')
                ->constrained('users')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('support_accesses', function (Blueprint $table) {
            $table->dropConstrainedForeignId('impersonated_user_id');
        });
    }
};

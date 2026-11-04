<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Saldo informado pela Cora no extrato (end.balance): única fonte de "saldo confirmado pelo banco". */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bank_statement_syncs', function (Blueprint $table) {
            $table->decimal('balance_end', 14, 2)->nullable()->after('divergent')->comment('Saldo após a última movimentação do período, informado pela Cora');
            $table->timestamp('balance_end_at')->nullable()->after('balance_end');
        });
    }

    public function down(): void
    {
        Schema::table('bank_statement_syncs', function (Blueprint $table) {
            $table->dropColumn(['balance_end', 'balance_end_at']);
        });
    }
};
